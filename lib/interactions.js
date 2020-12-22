"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionClient = exports.DiscordInteraction = void 0;
const discord_js_1 = __importDefault(require("discord.js"));
const noop = () => { };
const api = (client) => client.api;
class DiscordInteraction {
    constructor(client, interactions, data, guild, member, channel) {
        this._acknowledged = false;
        this.editableInitialResponse = false;
        this.deleted = false;
        this.client = client;
        this.interactions = interactions;
        this.id = data.id;
        this.type = data.type;
        this.token = data.token;
        this._options = data.data ? data.data.options : undefined;
        this.commandId = data.data ? data.data.id : "";
        this.commandName = data.data ? data.data.name : undefined;
        this.optionPath = buildOptionNamePath(this, this._options);
        this.guild = guild;
        this.channel = channel;
        this.member = member;
    }
    get acknowledged() {
        return this._acknowledged;
    }
    get options() {
        return buildOptionsPath(this);
    }
    async acknowledge(source) {
        if (this._acknowledged) {
            throw new Error("This interaction is already acknowledged");
        }
        this._acknowledged = true;
        return this.interactions.ackInteraction(this, source ? 5 : 2);
    }
    async replyChannel(source, data) {
        if (this._acknowledged) {
            throw new Error("This interaction is already acknowledged");
        }
        this._acknowledged = true;
        if (!data.flags || (data.flags & 64) === 0) {
            this.editableInitialResponse = true;
        }
        return this.interactions.ackInteraction(this, source ? 4 : 3, data);
    }
    async reply(source, content) {
        return this.replyChannel(source, {
            content,
        });
    }
    async whisper(source, content) {
        return this.replyChannel(source, {
            content,
            flags: 64,
        });
    }
    ensureResponseVisible() {
        if (!this._acknowledged) {
            throw new Error(`This interaction has yet to be acknowledged`);
        }
        if (!this.editableInitialResponse) {
            throw new Error(`Cannot modify initial response, it was either ephemeral or there was no sent message`);
        }
        if (this.deleted) {
            throw new Error(`Initial response was deleted, cannot be modified`);
        }
    }
    async edit(content) {
        this.ensureResponseVisible();
        await this.interactions.editInteractionResponse(this, content);
        return this;
    }
    async delete() {
        this.ensureResponseVisible();
        await this.interactions.deleteInteractionResponse(this);
        this.deleted = true;
        return this;
    }
    async createFollowupRaw(data) {
        return this.interactions.createFollowupInteraction(this, data);
    }
    async followupReply(content) {
        return this.createFollowupRaw({
            content,
        });
    }
    async followupWhisper(content) {
        return this.createFollowupRaw({
            content,
            flags: 64,
        });
    }
    static async convertInteraction(client, interactions, data) {
        const guild = await client.guilds.fetch(data.guild_id);
        const member = new discord_js_1.default.GuildMember(client, data.member, guild);
        const channel = guild.channels.cache.get(data.channel_id);
        return new DiscordInteraction(client, interactions, data, guild, member, channel);
    }
}
exports.DiscordInteraction = DiscordInteraction;
class DiscordFollowupMessage {
    constructor(client, interaction, data, channel, author) {
        this.deleted = false;
        this.patch(data);
        this.client = client;
        this.interactions = interaction.interactions;
        this.interaction = interaction;
        this.channel = channel;
        this.author = author;
    }
    checkInteraction() {
        if (this.flags && (this.flags & 64) !== 0) {
            throw new Error(`Cannot modify ephemeral followup message`);
        }
        if (this.deleted) {
            throw new Error(`Cannot interact with deleted followup message`);
        }
    }
    patch(data) {
        this.id = data.id;
        this.type = data.type;
        this.content = data.content;
        this.flags = data.flags;
        this.webhook_id = data.webhook_id;
    }
    async edit(content) {
        this.checkInteraction();
        const edited = (await this.interactions.editInteractionResponse(this.interaction, content, this.id));
        this.patch(edited);
        return this;
    }
    async delete() {
        this.checkInteraction();
        await this.interactions.deleteInteractionResponse(this.interaction, this.id);
        this.deleted = true;
        return this;
    }
    static construct(client, interaction, data) {
        const author = new discord_js_1.default.User(client, data.author);
        const channel = interaction.guild.channels.resolve(data.channel_id);
        if (!(channel instanceof discord_js_1.default.TextChannel)) {
            throw new Error(`Channel not found ${data.channel_id}`);
        }
        return new DiscordFollowupMessage(client, interaction, data, channel, author);
    }
}
class InteractionClient {
    constructor(client) {
        this.client = client;
        this.client.on("raw", (event) => {
            if (event.t !== "INTERACTION_CREATE") {
                return;
            }
            const data = event.d;
            if (data.type !== 2 || !data.data) {
                return;
            }
            DiscordInteraction.convertInteraction(this.client, this, data)
                .then((interaction) => this.client.emit("interactionCreate", interaction))
                .catch((e) => this.client.emit("error", e));
        });
    }
    commandsBase(guildId, input) {
        const base = api(this.client).applications(this.client.user ? this.client.user.id : undefined);
        if (guildId) {
            base.guilds(guildId);
        }
        return base.commands(input);
    }
    async createApplicationCommand(guildId, data) {
        return (await this.commandsBase(guildId).post({ data }));
    }
    async ackRawInteraction(id, token, type, callbackData) {
        const data = {
            type,
            data: callbackData,
        };
        return api(this.client).interactions(id)[token].callback().post({ data });
    }
    async ackInteraction(interaction, replyType, callbackData) {
        return this.ackRawInteraction(interaction.id, interaction.token, replyType, callbackData);
    }
    async replyInteraction(interaction, replyType, message) {
        return this.ackInteraction(interaction, replyType, {
            content: message,
        });
    }
    async getApplicationCommands(guildId) {
        const commands = (await this.commandsBase(guildId).get());
        return commands;
    }
    async deleteCommand(guildId, commandId) {
        return this.commandsBase(guildId, commandId).delete();
    }
    followupBase(interaction) {
        return api(this.client).webhooks(this.client.user ? this.client.user.id : undefined)[interaction.token];
    }
    async createFollowupInteraction(interaction, data) {
        const response = (await this.followupBase(interaction).post({ data }));
        return DiscordFollowupMessage.construct(this.client, interaction, response);
    }
    async editInteractionResponse(interaction, content, messageId = "@original") {
        const data = {
            content,
        };
        return this.followupBase(interaction).messages[messageId].patch({ data });
    }
    async deleteInteractionResponse(interaction, messageId = "@original") {
        return this.followupBase(interaction).messages[messageId].delete();
    }
}
exports.InteractionClient = InteractionClient;
function buildOptionCloner(interaction, path) {
    const handler = {
        get(_, name) {
            let clonedPath = path;
            if (clonedPath) {
                clonedPath += ".";
            }
            clonedPath += name.toLowerCase();
            return buildOptionsPath(interaction, clonedPath);
        },
        apply() {
            return buildOptionsPath(interaction, path);
        },
    };
    return new Proxy(noop, handler);
}
function buildOptionsPath(interaction, path = "") {
    function getFinalPath(path) {
        if (interaction.optionPath && !path.startsWith(interaction.optionPath)) {
            path = interaction.optionPath + "." + path;
        }
        return path;
    }
    const handler = {
        get(_, name) {
            if (name === "clone") {
                return buildOptionCloner(interaction, path);
            }
            let newPath = path;
            if (newPath) {
                newPath += ".";
            }
            newPath += name.toLowerCase();
            return buildOptionsPath(interaction, newPath);
        },
        apply() {
            return readInteractionValue(interaction, getFinalPath(path));
        },
    };
    return new Proxy(noop, handler);
}
function buildOptionNamePath(interaction, inputOptions, path = "") {
    if (inputOptions) {
        for (const { options, name, value } of inputOptions) {
            if (name && !value) {
                path += name + ".";
            }
            return buildOptionNamePath(interaction, options, path);
        }
    }
    if (path.length > 0) {
        return path.substring(0, path.length - 1);
    }
    return "";
}
function readInteractionValue(interaction, fullPath) {
    const option = findOption(interaction._options, fullPath);
    return option ? option.value : undefined;
}
function findOption(options, fullPath) {
    if (!options) {
        return;
    }
    let option;
    for (const optionName of fullPath.split(".")) {
        if (!options) {
            return;
        }
        option = options.find((option) => option.name === optionName);
        if (!option) {
            console.log(`Failed to find optionName ${optionName} for path ${fullPath}, available: ${options
                .map((o) => o.name)
                .join(", ")}`);
            return;
        }
        options = option.options;
    }
    return option;
}
