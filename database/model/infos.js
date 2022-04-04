const mongoose = require('mongoose');

const infosSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
    },
});

mongoose.model("Infos", infosSchema);

module.exports = infosSchema;
