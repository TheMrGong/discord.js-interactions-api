"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.command = exports.group = exports.subCommand = exports.requiredChannel = exports.channel = exports.requiredBoolean = exports.boolean = exports.requiredString = exports.string = exports.choice = exports.requiredUser = exports.user = void 0;
function user(name, description) {
    return {
        name,
        description,
        type: 6,
    };
}
exports.user = user;
function requiredUser(name, description) {
    return {
        ...user(name, description),
        required: true,
    };
}
exports.requiredUser = requiredUser;
function choice(name, value = name) {
    return {
        name,
        value,
    };
}
exports.choice = choice;
function string(name, description, ...validVoices) {
    const choices = [];
    validVoices.forEach((choice) => {
        if (typeof choice === "string") {
            choices.push({
                name: choice,
                value: choice,
            });
        }
        else {
            choices.push(choice);
        }
    });
    return {
        name,
        description,
        choices,
        type: 3,
    };
}
exports.string = string;
function requiredString(name, description, ...voices) {
    return {
        ...string(name, description, ...voices),
        required: true,
    };
}
exports.requiredString = requiredString;
function boolean(name, description) {
    return {
        name,
        description,
        type: 5,
    };
}
exports.boolean = boolean;
function requiredBoolean(name, description) {
    return {
        ...boolean(name, description),
        required: true,
    };
}
exports.requiredBoolean = requiredBoolean;
function channel(name, description) {
    return {
        name,
        description,
        type: 7,
    };
}
exports.channel = channel;
function requiredChannel(name, description) {
    return {
        ...channel(name, description),
        required: true,
    };
}
exports.requiredChannel = requiredChannel;
function subCommand(name, description, options) {
    return {
        name,
        description,
        options,
        type: 1,
    };
}
exports.subCommand = subCommand;
function group(name, description, options) {
    return {
        name,
        description,
        options,
        type: 2,
    };
}
exports.group = group;
function command(name, description, options) {
    return {
        name,
        description,
        options,
    };
}
exports.command = command;
