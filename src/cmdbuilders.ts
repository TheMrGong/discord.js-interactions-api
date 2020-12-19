import {
    APIApplicationCommandOption,
    APIApplicationCommandOptionChoice,
    ApplicationCommandOptionType,
} from "discord-api-types/v8"
import { APICreateCommandData } from "./types"

export function user(name: string, description: string): APIApplicationCommandOption {
    return {
        name,
        description,
        type: ApplicationCommandOptionType.USER,
    }
}

export function requiredUser(name: string, description: string): APIApplicationCommandOption {
    return {
        ...user(name, description),
        required: true,
    }
}

export function choice(name: string, value: string = name): APIApplicationCommandOptionChoice {
    return {
        name,
        value,
    }
}

export function string(
    name: string,
    description: string,
    ...validVoices: APIApplicationCommandOptionChoice[] | string[]
): APIApplicationCommandOption {
    const choices: APIApplicationCommandOptionChoice[] = []

    validVoices.forEach((choice: string | APIApplicationCommandOptionChoice) => {
        if (typeof choice === "string") {
            choices.push({
                name: choice,
                value: choice,
            })
        } else {
            choices.push(choice)
        }
    })

    return {
        name,
        description,
        choices,
        type: ApplicationCommandOptionType.STRING,
    }
}

export function requiredString(
    name: string,
    description: string,
    ...voices: APIApplicationCommandOptionChoice[] | string[]
): APIApplicationCommandOption {
    return {
        ...string(name, description, ...voices),
        required: true,
    }
}

export function boolean(name: string, description: string): APIApplicationCommandOption {
    return {
        name,
        description,
        type: ApplicationCommandOptionType.BOOLEAN,
    }
}

export function requiredBoolean(name: string, description: string): APIApplicationCommandOption {
    return {
        ...boolean(name, description),
        required: true,
    }
}

export function channel(name: string, description: string): APIApplicationCommandOption {
    return {
        name,
        description,
        type: ApplicationCommandOptionType.CHANNEL,
    }
}

export function requiredChannel(name: string, description: string): APIApplicationCommandOption {
    return {
        ...channel(name, description),
        required: true,
    }
}

export function subCommand(
    name: string,
    description: string,
    options: APIApplicationCommandOption[]
): APIApplicationCommandOption {
    return {
        name,
        description,
        options,
        type: ApplicationCommandOptionType.SUB_COMMAND,
    }
}

export function group(
    name: string,
    description: string,
    options: APIApplicationCommandOption[]
): APIApplicationCommandOption {
    return {
        name,
        description,
        options,
        type: ApplicationCommandOptionType.SUB_COMMAND_GROUP,
    }
}

export function command(
    name: string,
    description: string,
    options?: APIApplicationCommandOption[]
): APICreateCommandData {
    return {
        name,
        description,
        options,
    }
}
