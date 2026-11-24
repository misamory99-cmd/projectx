require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

// ==========================================
// ⚠️ ZDE JSOU ID SERVERŮ ⚠️
// ==========================================
const MDT_GUILD_ID = "1564353870661161080"; 
// ⚠️ SEM VLOŽ ID HL SERVERU (tam kde je UNB) ⚠️
const HL_GUILD_ID = "1352661889015873679"; 
const UNB_API_KEY = process.env.UNB_API_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Pojistka: Když se stane chyba, bot nespadne, jen ji vypíše.
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Nezachycená chyba v botovi:', reason);
});

function formatPrice(n) { return '$' + new Intl.NumberFormat('en-US').format(n); }
function cleanName(jmeno) {
    return jmeno.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
}


// 1. NOVÁ OBJEDNÁVKA
app.post('/api/poslat-log', async (req, res) => {
    const { auto, jmeno, cena } = req.body;
    try {
        const guild = client.guilds.cache.get(MDT_GUILD_ID);
        if (!guild) return res.status(500).json({ error: 'Bot není na MDT serveru.' });

        let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === 'AUTO SHOP');
        if (!category) category = await guild.channels.create({ name: 'AUTO SHOP', type: ChannelType.GuildCategory });

        let logChannel = guild.channels.cache.find(c => c.name === 'logs' && c.parentId === category.id) || guild.channels.cache.find(c => c.name === 'logs');
        if (!logChannel) logChannel = await guild.channels.create({ name: 'logs', type: ChannelType.GuildText, parent: category.id });

        const embed = new EmbedBuilder()
            .setColor(0x3b82f6).setTitle('🛒 Nová objednávka')
            .addFields(
                { name: '🚗 Vozidlo', value: auto, inline: true },
                { name: '💰 Cena', value: formatPrice(cena), inline: true },
                { name: '👤 Zákazník', value: jmeno, inline: true }
            );

        await logChannel.send({ embeds: [embed] });

        const cName = cleanName(jmeno);
        let userChannel = guild.channels.cache.find(c => c.name === cName);
        if (!userChannel) {
            userChannel = await guild.channels.create({
                name: cName, type: ChannelType.GuildText, parent: category.id,
                permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
            });
        }
        await userChannel.send({ embeds: [embed] });
        
        res.json({ ok: true });
    } catch (err) {
        console.error("❌ Chyba kanálů:", err.message);
        res.status(500).json({ error: 'Chyba při vytváření kanálu.' });
    }
});

// 2. SCHVÁLENÍ (Zde to nejčastěji padá)
app.post('/api/poslat-dm', async (req, res) => {
    const { discordId, auto, spz, jmeno, cena } = req.body;
    console.log(`🔥 Zkouším schválit objednávku pro hráče: ${discordId}`);

    try {
        if (!UNB_API_KEY) return res.status(400).json({ error: 'V .env chybí UNB_API_KEY!' });
        if (HL_GUILD_ID === "SEM_VLOZ_ID_HL_SERVERU") return res.status(400).json({ error: 'V bot.js jsi nevyplnil ID HL serveru!' });

        console.log(`➡️  Volám UNB API na serveru: ${HL_GUILD_ID}`);
        
        // Kontrola peněz
        const kontrola = await fetch(`https://unbelievaboat.com/api/v1/guilds/${HL_GUILD_ID}/users/${discordId}`, {
            headers: { 'Authorization': UNB_API_KEY }
        });

        if (!kontrola.ok) {
            const chybaText = await kontrola.text();
            console.log(`❌ UNB odmítl:`, chybaText);
            return res.status(400).json({ error: `UNB chyba: ${chybaText}` });
        }

        const data = await kontrola.json();
        const celkem = (data.cash || 0) + (data.bank || 0);
        
        if (celkem < cena) {
            return res.status(400).json({ error: `Hráč nemá dost peněz! Má jen ${formatPrice(celkem)}.` });
        }

        // Stržení
        console.log(`➡️  Strhávám ${formatPrice(cena)}...`);
        const strhnout = await fetch(`https://unbelievaboat.com/api/v1/guilds/${HL_GUILD_ID}/users/${discordId}`, {
            method: 'PATCH',
            headers: { 'Authorization': UNB_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cash: -cena })
        });

        const strhnoutData = await strhnout.json();
        
        if (!strhnout.ok) {
            console.log(`❌ UNB neumožnil stržení:`, strhnoutData);
            return res.status(400).json({ error: `UNB chyba: ${JSON.stringify(strhnoutData)}` });
        }

        console.log(`✅ Peníze úspěšně strženy!`);

        // Odeslání zpráv
        const user = await client.users.fetch(discordId).catch(() => null);
        if (user) {
            const dmEmbed = new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Koupě schválena!')
                .addFields(
                    { name: '🚗 Vozidlo', value: auto, inline: true },
                    { name: '🔑 SPZ', value: spz, inline: true },
                    { name: '💰 Cena', value: formatPrice(cena), inline: true }
                );
            await user.send({ embeds: [dmEmbed] }).catch(()=>{});
        }

        res.json({ ok: true });

    } catch (err) {
        console.error("❌ CHYBA PŘI SCHVALOVÁNÍ:", err.message);
        res.status(500).json({ error: 'Chyba spojení s UNB.' });
    }
});

app.listen(3001, () => console.log('🤖 BOT API BĚŽÍ NA: http://localhost:3000'));
client.once('clientReady', () => console.log(`✅ BOT JE ONLINE: ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
