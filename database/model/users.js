const mongoose = require('mongoose');

const usersSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    bank: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
    },
    isAdmin: {
        type: Boolean,
        required: false,
        default: false,
    },
    isAvailable: {
        type: Boolean,
        required: false,
        default: false,
    },
    note: {
        type: String,
        required: false,
        default: '',
    },
    badges: {
        type: [mongoose.ObjectId],
        required: false,
        default: [],
    }
});

mongoose.model("Users", usersSchema);

module.exports = usersSchema;
