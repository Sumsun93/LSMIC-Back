'use strict';
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const expressSwagger = require('express-swagger-generator')(app);
const srvConfig = require('./config');
const mongoose = require('mongoose');
const fs = require('fs');
const https = require('https');
const { Server } = require("socket.io");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {CONNECTION_TYPE, DB_HOST, DB_USERNAME, DB_PASSWORD, DB_PORT, DB_NAME, DB_QUERY_PARAMS} = srvConfig;
const dbAuthString = (DB_USERNAME && DB_PASSWORD) ? `${srvConfig.DB_USERNAME}:${srvConfig.DB_PASSWORD}@` : '';

let httpServer;

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", '*');
    res.header("Access-Control-Allow-Credentials", true);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header("Access-Control-Allow-Headers", 'Origin,X-Requested-With,Content-Type,Accept,content-type,application/json');
    next();
});

/**
 * Configure middleware
 */
app.use(
    cors({
        // origin: `http://localhost:${srvConfig.SERVER_PORT}`,
        origin: function (origin, callback) {
            return callback(null, true)
        },
        optionsSuccessStatus: 200,
        credentials: true
    }),
    session({
        saveUninitialized: true,
        secret: srvConfig.SESSION_SECRET,
        resave: true
    }),
    cookieParser(),
    bodyParser.json()
);

/**
 * Include all API Routes
 */
app.use('/api', require('./routes/api'));

/**
 * Swagger UI documentation
 */
if (srvConfig.SWAGGER_SETTINGS.enableSwaggerUI)
    expressSwagger(srvConfig.SWAGGER_SETTINGS);

/**
 * Configure http(s)Server
 */
if (srvConfig.HTTPS_ENABLED) {
    const privateKey = fs.readFileSync(srvConfig.PRIVATE_KEY_PATH, 'utf8');
    const certificate = fs.readFileSync(srvConfig.CERTIFICATE_PATH, 'utf8');
    const ca = fs.readFileSync(srvConfig.CA_PATH, 'utf8');

    // Create a HTTPS server
    httpServer = https.createServer({key: privateKey, cert: certificate, ca: ca}, app);
} else {
    // Create a HTTP server
    httpServer = http.createServer({}, app);
}

/**
 * Start http server & connect to MongoDB
 */
httpServer.listen(srvConfig.SERVER_PORT, () => {
    mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://sumsun:cH9EXN3KntZHxwfi@cluster0.nmb9d.mongodb.net/lsmic?retryWrites=true&w=majority", {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, (err) => {
        if (err) {
            console.log(err);
        }
        console.log(`Server started on port ${srvConfig.SERVER_PORT}`);
    });
});

/**
 * Socket.io section
 */

const whitelistCors = ['https://main.d2celo6ip9m223.amplifyapp.com', 'https://www.lsmic.fr', 'http://localhost:5173', 'https://sumsun93.github.io']
const io = new Server(httpServer, {
    cors: {
        origin: function (origin, callback) {
            if (whitelistCors.indexOf(origin) !== -1) {
                callback(null, true)
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        },
        methods: ["GET", "POST"]
    }
});

const Users = mongoose.model('Users');
const Badges = mongoose.model('Badges');
const Ranks = mongoose.model('Ranks');
const Services = mongoose.model('Services');
const Infos = mongoose.model('Infos');
io.use(function(socket, next){
    if (socket.handshake.auth && socket.handshake.auth.token){
        jwt.verify(socket.handshake.auth.token, 'LeLSMICCestNous', function(err, decoded) {
            if (err) return next(new Error('Authentication error'));
            socket.decoded = decoded;
            next();
        });
    }
    else {
        next(new Error('Authentication error'));
    }
}).on('connection', async (socket) => {
    console.log(`New connection: ${socket.id}`);

    const user = await Users.findOne({ _id: socket.decoded.id })

    if (!user) {
        socket.emit('disconnectUser');
        return;
    }

    socket.emit('connectUser', {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin,
        isAvailable: user.isAvailable,
        phone: user.phone,
        bank: user.bank,
        note: user.note,
        badges: user.badges,
        ranks: user.ranks,
        services: user.services,
    })

    socket.on('getDispatch', async () => {
        const user = await Users.findOne({ _id: socket.decoded.id })

        if (user.isAdmin) {
            socket.join('adminRoom');
        }

        socket.join(socket.decoded.id);

        const allUsers = await Users.find();
        socket.emit('getDispatch', {
            members: allUsers.map(usr => ({
                id: usr._id,
                username: usr.username,
                isAdmin: usr.isAdmin,
                isAvailable: usr.isAvailable,
                phone: usr.phone,
                bank: usr.bank,
                note: usr.note,
                badges: usr.badges,
                ranks: usr.ranks,
                services: usr.services,
            })),
            badges: await Badges.find(),
            ranks: await Ranks.find(),
            services: await Services.find(),
        });
    })

    socket.on('getAllBadges', async () => {
        const allBadges = await Badges.find();
        socket.emit('getAllBadges', allBadges);
    })

    socket.on('getAllRanks', async () => {
        const allRanks = await Ranks.find();
        socket.emit('getAllRanks', allRanks);
    })

    socket.on('getAllServices', async () => {
        const allServices = await Services.find();
        socket.emit('getAllServices', allServices);
    })

    socket.on('getLastInfos', async () => {
        const infos = await Infos.findOne({}, {}, { sort: { '_id' : -1 } });
        socket.emit('editInfos', infos?.text || '');
    })

    socket.on('available', async (data) => {
        await Users.updateOne({
            _id: socket.decoded.id,
        }, {
            isAvailable: data.state,
        }, null, (err) => {
            if (err) {
                console.log(err);
            }
            else {
                socket.emit('available', data.state);

                io.emit('updateOtherDispatchUser', {
                    userId: socket.decoded.id,
                    newData: {
                        isAvailable: data.state,
                    }
                });
            }
        })
    })

    socket.on('availableOther', async (data) => {
        if (!socket.decoded.isAdmin) return;

        await Users.updateOne({
            _id: data.id,
        }, {
            isAvailable: data.state,
        }, null, (err) => {
            if (err) {
                console.log(err);
            }
            else {
                io.to(data.id).emit('available', data.state);

                io.emit('updateOtherDispatchUser', {
                    userId: data.id,
                    newData: {
                        isAvailable: data.state,
                    }
                });
            }
        })
    })

    socket.on('updateUser', async (data) => {
        await Users.updateOne({
            _id: socket.decoded.id,
        }, {
            ...data,
        }, null, (err) => {
            if (err) {
                console.log(err);
            }
            else {
                socket.emit('updateUser', {
                    ...data,
                });

                io.emit('updateOtherDispatchUser', {
                    userId: socket.decoded.id,
                    newData: data,
                });
            }
        })
    })

    socket.on('startPatrol', async (data) => {
        const { patrol, mates } = data;

        await Users.updateMany({
            _id: {
                $in: [...mates, socket.decoded.id]
            }
        }, {
            $set: {
                badges: [patrol],
            }
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                [...mates, socket.decoded.id].forEach((id) => {
                    io.to(id).emit('updateUser', {
                        badges: [patrol],
                    });
                    io.emit('updateOtherDispatchUser', {
                        userId: id,
                        newData: {
                            badges: [patrol],
                        },
                    });
                });
            }
        })
    })


    socket.on('updateOtherUser', async (data) => {
        if (!socket.decoded.isAdmin) return;

        await Users.updateOne({
            _id: data.id
        }, {
            ...data.newData,
        }, null, (err) => {
            if (err) {
                console.log(err);
            }
            else {
                io.to(data.id).emit('updateUser', {
                    ...data.newData,
                });

                io.emit('updateOtherDispatchUser', {
                    userId: data.id,
                    newData: data.newData,
                });
            }
        })
    })

    socket.on('updateMultiUsers', async (data) => {
        if (!socket.decoded.isAdmin) return;

        const users = await Users.find({ ...data.filter });

        if (users) {
            users.forEach(async (user) => {
                await Users.updateOne({
                    _id: user._id,
                }, {
                    ...data.newData,
                }, null, (err) => {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        io.to(user._id.toString()).emit('updateUser', {
                            ...data.newData,
                        });
                    }
                })
            })

            const allUsers = await Users.find();
            io.emit('getAllUsers', allUsers.map(usr => ({
                id: usr._id,
                username: usr.username,
                isAdmin: usr.isAdmin,
                isAvailable: usr.isAvailable,
                phone: usr.phone,
                bank: usr.bank,
                note: usr.note,
                badges: usr.badges,
                ranks: usr.ranks,
                services: usr.services,
            })));
        }
    })

    socket.on('deleteUser', async (user) => {
        await Users.deleteOne({
            ...user
        }, null, (err) => {
            if (err) {
                console.log(err);
            }
            else {
                io.to(user._id).emit('disconnectUser');
                io.emit('updateOtherDispatchUser', {
                    deleted: true,
                    userId: user._id,
                });
            }
        })
    })

    socket.on('createBadge', async ({ label, color }) => {
        const newBadge = new Badges({
            label,
            color,
        });

        await newBadge.save(function (err, data) {
            if (err) return console.error(err);
            io.emit('newBadge', data);
        });
    })

    socket.on('deleteBadge', async ({ badgeId }) => {
        await Badges.deleteOne({
            _id: badgeId
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const allBadges = await Badges.find();
                io.emit('getAllBadges', allBadges);
            }
        })
    })

    socket.on('editBadge', async ({ badgeId, data }) => {
        await Badges.updateOne({
            _id: badgeId
        }, {
            ...data,
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const badges = await Badges.find({});
                io.emit('getAllBadges', badges);
            }
        })
    })

    socket.on('createRank', async ({ label, color }) => {
        const newRank = new Ranks({
            label,
            color,
        });

        await newRank.save(function (err, data) {
            if (err) return console.error(err);
            io.emit('newRank', data);
        });
    })

    socket.on('deleteRank', async ({ rankId }) => {
        await Ranks.deleteOne({
            _id: rankId
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const allRanks = await Ranks.find();
                io.emit('getAllRanks', allRanks);
            }
        })
    })

    socket.on('editRank', async ({ rankId, data }) => {
        await Ranks.updateOne({
            _id: rankId
        }, {
            ...data,
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const ranks = await Ranks.find({});
                io.emit('getAllRanks', ranks);
            }
        })
    })

    socket.on('createService', async ({ label, color }) => {
        const newService = new Services({
            label,
            color,
        });

        await newService.save(function (err, data) {
            if (err) return console.error(err);
            io.emit('newService', data);
        });
    })

    socket.on('deleteService', async ({ serviceId }) => {
        await Services.deleteOne({
            _id: serviceId
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const allServices = await Services.find();
                io.emit('getAllServices', allServices);
            }
        })
    })

    socket.on('editService', async ({ serviceId, data }) => {
        await Services.updateOne({
            _id: serviceId
        }, {
            ...data,
        }, null, async (err) => {
            if (err) {
                console.log(err);
            }
            else {
                const services = await Services.find({});
                io.emit('getAllServices', services);
            }
        })
    })

    socket.on('editInfos', (text) => {
        const newInfos = new Infos({
            text,
        });

        newInfos.save(function (err, data) {
            if (err) return console.error(err);
            io.emit('editInfos', data.text);
        });
    })

    socket.on('disconnect', async () => {
        console.log(`Connection left (${socket.id})`);
    });
});

