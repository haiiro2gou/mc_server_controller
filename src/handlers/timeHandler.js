import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import log from '../utils/logOutput.cjs';
import config from '../../config.json' assert { type: "json" };

import getServerStatus from '../utils/getServerStatus.js';

export async function queueProcess() {
    const { default: cache } = await import('../../cache.json', { assert: { type: "json" } });
    if (cache.queue?.length) {
        const q = cache.queue.shift();
        log(`Started processing the start-up queue of server "${q.server}".`);
        fs.writeFileSync(path.join(__dirname, '..', '..', 'cache.json'), JSON.stringify(cache));
        const ssh = new NodeSSH();
        await ssh.connect({
            host: process.env.SERVER_IP,
            port: process.env.SERVER_PORT,
            username: process.env.SSH_USER,
            privateKey: process.env.SSH_PRIVATE,
        })
        await ssh.execCommand(`kubectl scale -n ${process.env.NAMESPACE}-${q.guild} deployment/${q.server} --replicas=1`);
        ssh.dispose();
    }
}

export async function filterServerCache() {
    const { default: cache } = await import('../../cache.json', { assert: { type: "json" } });
    cache.guilds = cache.guilds.filter((element) => parseInt((new Date() - new Date(element.date)) / 1000 / 60 / 60 / 24) <= 30);
    fs.writeFileSync(path.join(__dirname, '..', '..', 'cache.json'), JSON.stringify(cache));
}

export async function updateServerStatus(client) {
    const { default: cache } = await import('../../cache.json', { assert: { type: "json" } });

    for (const guild of config.guilds) {
        const current = cache.notification.find((element) => element.id === guild.id) || { id: guild.id, data: [] };
        let result = [];

        for (const build of guild.builds) {
            const status = await getServerStatus(`${build.name}.${process.env.NAMESPACE}-${guild.id}`);
            result.push({
                name: build.alias,
                online: status.online,
                players: status.data?.players.online || 0,
                max: status.data?.players.max || 0,
                // motd: status.data?.description.text.replace(/\n/, ' ') || "",
            });
        }

        let check = true;
        if (!current.data.length ||
            !result.length ||
            current.data.length !== result.length
        ) {
            check = false;
        }
        if (check) {
            for (const status of result) {
                if (!current.data.some((element) => element.name === status.name)) {
                    check = false;
                    break;
                }
                const c = current.data.find((element) => element.name === status.name);
                if (
                    c.name !== status.name ||
                    c.online !== status.online ||
                    c.players !== status.players ||
                    c.max !== status.max // ||
                    // c.motd !== status.motd
                ) {
                    check = false;
                    break;
                }
            }
        }

        if (!check) {
            const guildName = await client.guilds.cache.get(guild.id).name;
            log(`[${guildName}] Server data has been updated!`);

            let content = `## Server Status\n\`\`\`${process.env.IP_ALIAS}\`\`\`\n`;
            for (const status of result) {
                if (status.online) {
                    content += `:green_circle: [${status.name}] ${status.players}/${status.max} Players Online\n`;
                } else if (guild.builds.find((element) => element.id === status.id).display) {
                    content += `:red_circle: [${status.name}] -\n`;
                }
            }
            content += `\nLast Update: ${new Date().toString()}\n`

            for (const notifyId of guild.notification) {
                const channel = await client.channels.fetch(`${notifyId}`);
                const messages = await channel.messages.fetch({ limit: 25 });
                const target = messages.find((message) => message.author.id === process.env.APP_ID);

                if (target !== undefined) {
                    target.edit(content);
                } else {
                    channel.send(content);
                }
            }
        }

        cache.notification = cache.notification.filter((element) => element.id !== guild.id);
        cache.notification.push({
            id: guild.id,
            data: result,
        });
    }
    fs.writeFileSync(path.join(__dirname, '..', '..', 'cache.json'), JSON.stringify(cache));
}
