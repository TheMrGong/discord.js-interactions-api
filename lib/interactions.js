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
        this.acknowledged = false;
        this.editableInitialResponse = false;
        this.deleted = false;
        this.client = client;
        this.interactions = interactions;
        this.id = data.id;
        this.type = data.type;
        this.token = data.token;
        this._options = data.data?.options;
        this.commandId = data.data?.id || "";
        this.guild = guild;
        this.channel = channel;
        this.member = member;
    }
    get options() {
        return buildOptionsPath(this);
    }
    async acknowledge(source) {
        if (this.acknowledged) {
            throw new Error("This interaction is already acknowledged");
        }
        this.acknowledged = true;
        return this.interactions.ackInteraction(this, source ? 5 : 2);
    }
    async replyChannel(source, data) {
        if (this.acknowledged) {
            throw new Error("This interaction is already acknowledged");
        }
        this.acknowledged = true;
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
        if (!this.acknowledged) {
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
class CommandManager {
    constructor(interactions) {
        this.registered = {};
        this.interactions = interactions;
        this.interactions.client.on("raw", (event) => {
            if (event.t !== "INTERACTION_CREATE") {
                return;
            }
            const rawInteraction = event.d;
            if (rawInteraction.type !== 2 || !rawInteraction.data) {
                return;
            }
            const cmdData = this.registered[rawInteraction.data.id];
            if (cmdData) {
                try {
                    DiscordInteraction.convertInteraction(interactions.client, this.interactions, rawInteraction)
                        .then(cmdData.handler)
                        .catch((e) => {
                        console.error(`Failed to handle interaction`);
                        console.error(e);
                    });
                }
                catch (e) {
                    console.error(`Uncaught error occurred while handling interaction for command ${cmdData.command.name}`);
                    console.error(e);
                }
            }
            else {
                const handler = (type) => {
                    console.warn(`User ${rawInteraction.member.user.username}#${rawInteraction.member.user.discriminator}(${rawInteraction.member.user.id}) attempted to use ${type} unregistered command '${rawInteraction.data?.name}'`);
                    this.interactions.ackRawInteraction(rawInteraction.id, rawInteraction.token, 3, {
                        content: `The command you tried to use no longer exists`,
                        flags: 64,
                    });
                };
                this.interactions
                    .deleteCommand(rawInteraction.guild_id, rawInteraction.data.id)
                    .then(() => handler(`guild(${rawInteraction.guild_id})`))
                    .catch((e) => {
                    this.interactions
                        .deleteCommand(undefined, rawInteraction.data?.id || "")
                        .then(() => handler(`global`))
                        .catch((e) => {
                        console.warn(`Failed to remove unregistered command ${rawInteraction.data?.name}, wasn't either a global or guild command`);
                    });
                });
            }
        });
    }
    async _createCommand(guildId, data, handler) {
        const command = await this.interactions.createApplicationCommand(guildId, data);
        this.registered[command.id] = {
            command,
            handler,
        };
    }
    async createGuildCommand(guildId, data, handler) {
        return this._createCommand(guildId, data, handler);
    }
    async createGlobalCommand(data, handler) {
        return this._createCommand(undefined, data, handler);
    }
    async cleanupUnreferencedGlobalCommands() {
        for (const command of await this.interactions.getApplicationCommands()) {
            if (!this.registered[command.id]) {
                console.info(`Deleting global command '${command.name}' that was no longer registered`);
                console.log(JSON.stringify(await this.interactions.deleteCommand(undefined, command.id).catch((error) => {
                    return { e: error };
                })));
            }
        }
    }
}
class InteractionClient {
    constructor(client) {
        this.client = client;
        this.commands = new CommandManager(this);
    }
    commandsBase(guildId, input) {
        const base = api(this.client).applications(this.client.user?.id);
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
        return api(this.client).webhooks(this.client.user?.id)[interaction.token];
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
            const option = findOption(interaction._options, newPath);
            if (option && (!option.options || option.options.length === 0)) {
                return readInteractionValue(interaction, newPath);
            }
            return buildOptionsPath(interaction, newPath);
        },
        apply() {
            return readInteractionValue(interaction, path);
        },
    };
    return new Proxy(noop, handler);
}
function validatePath(interaction, fullPath) {
    const cmdData = interaction.interactions.commands.registered[interaction.commandId];
    if (!cmdData) {
        throw new Error("Couldn't find interaction command");
    }
    if (!findOption(cmdData.command.options, fullPath)) {
        throw new Error(`Unable to find option at path ${fullPath}`);
    }
}
function readInteractionValue(interaction, fullPath) {
    validatePath(interaction, fullPath);
    return findOption(interaction._options, fullPath)?.value;
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
