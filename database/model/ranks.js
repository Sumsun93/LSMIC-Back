const mongoose = require('mongoose');

const ranksSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        required: true,
    },
});

mongoose.model("Ranks", ranksSchema);

module.exports = ranksSchema;
