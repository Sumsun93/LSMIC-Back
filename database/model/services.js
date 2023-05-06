const mongoose = require('mongoose');

const servicesSchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        required: true,
    },
});

mongoose.model("Services", servicesSchema);

module.exports = servicesSchema;
