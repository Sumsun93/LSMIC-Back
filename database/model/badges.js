const mongoose = require('mongoose');

const badgesSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        required: true,
    },
});

mongoose.model("Badges", badgesSchema);

module.exports = badgesSchema;
