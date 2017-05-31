"use strict";
const fs = require("fs");
const Discord = require('discord.js');
const eveonlinejs = require('eveonlinejs');
const yaml = require('js-yaml');
const moment = require('moment');

const config = require('./config.json');

const maxNotificationID = require('./maxNotificationID.json');

eveonlinejs.setParams({
    keyID: config.keyid,
    vCode: config.vcode,
    characterID: config.characterid
});

function saveMaxNotificationID(id) {
    fs.writeFile("maxNotificationID.json", JSON.stringify({maxID: id}));
}

async function apiFetch(endpoint, params={}) {
    return new Promise((resolve, reject) => {
        eveonlinejs.fetch(endpoint,params, function(err,result) {
            if(err) 
                reject(err)
            else
                resolve(result);
        });
    });
}

async function addNotificationTexts(n) {
    let ids = n.map(x => x.notificationID);
    let bodies = await apiFetch('Char:NotificationTexts', {IDs: ids});
    bodies = Object.values(bodies.notifications);
    bodies = bodies.map(x => Object.assign(x,yaml.safeLoad(x.cdata)));
    var result = n.map((e,i) => {
        return Object.assign(e,bodies[i]);
    });
    return result;
}

function getApplicationText(notif) {
    if("applicationText" in notif) {
        return notif.applicationText.replace(/<br>/g,"\n");
    } else {
        return "";
    }
}

function addLinks(embed, notif) {
    var characterName = notif.senderName.replace(/ /g,"%20");
    embed.addField("zKillboard", `https://zkillboard.com/character/${notif.charID}/`, true);
    embed.addField("EVE Who", `http://evewho.com/pilot/${characterName}/`, true);
    return embed;
}

function setUpEmbed(notif) {
    let embed = new Discord.RichEmbed();
    embed.setFooter(moment(notif.sentDate).format("DD.MM.YYYY, HH:mm"));
    embed.setThumbnail(`https://image.eveonline.com/Character/${notif.charID}_64.jpg`);
    return embed;
}

function CorpApplicationEvent(notif) {
    let text = "New Application to Corp";
    let embed = setUpEmbed(notif);
    embed.setTitle(notif.senderName).setColor("#3498db");
    embed.setDescription(getApplicationText(notif));
    embed = addLinks(embed, notif);
    return [text, embed];
}

function CorpLeaveEvent(notif) {
    let text = "Character left Corp";
    let embed = setUpEmbed(notif);
    embed.setTitle(notif.senderName).setColor("#e74c3c");
    return [text, embed];
}

function CorpJoinEvent(notif) {
    let text = "Character joined Corp";
    let embed = setUpEmbed(notif);
    embed.setTitle(notif.senderName).setColor("#27ae60");
    embed.setDescription(getApplicationText(notif));
    return [text, embed];
}

function CorpApplicationWithdrawnEvent(notif) {
    let text = "Character has withdrawn his application";
    let embed = setUpEmbed(notif);
    embed.setTitle(notif.senderName).setColor("#c0392b");
    return [text, embed];
}

function toDiscordMessage(notif) {
    const handlers = {};
    handlers["16"] = CorpApplicationEvent;
    handlers["21"] = CorpLeaveEvent;
    handlers["128"] = CorpJoinEvent;
    handlers["130"] = CorpApplicationWithdrawnEvent

    if(notif.typeID in handlers) {
        return handlers[notif.typeID](notif);
    } else {
        return undefined;
    }
}

async function doit() {
    let result = await apiFetch('Char:Notifications');
    let n = Object.values(result.notifications);
    n = n.filter(x => x.notificationID > maxNotificationID.maxID);
    let interestingN = n.filter(x => config.filter.includes(x.typeID));
    if(interestingN.length > 0) {
        let withTexts = await addNotificationTexts(interestingN);
        let ids = withTexts.map(x => parseInt(x.notificationID));
        let maxID = Math.max(...ids);
        saveMaxNotificationID(maxID);
        return withTexts.map(toDiscordMessage);
    }
    return [];
}

async function send() {
    const hook = new Discord.WebhookClient(config.webhookid, config.webhooktoken);

    let notifs = await doit();

    notifs.forEach(([message, embed]) => {
        console.log(message);
        hook.send(message, {embeds: [embed]});
    });
}

send();
