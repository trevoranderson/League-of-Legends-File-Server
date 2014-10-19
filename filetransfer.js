var lolChat = require('./lol-xmpp.js');
var config = require('./config.js');
var fs = require('fs');
//
var maxlength = 2900;
var timeoutMS = 3000;
//Connect to the chat
lolChat.connect(config.uname, config.pw, lolChat.LoLXMPP.SERVERS.na);
// Events
lolChat.events.on('onlineFriendsUpdate', function (friend) {
    //console.log("Friend logged on: " + friend);
});
/*
 * Requester sends {file: fname} with optional {chunk: number} if he is missing a piece
 * Server sends {status: code, filesize: number}
 * Then Server sends {offset: number, body: base64string}
 * until the file is served
 * Server is fire and forget. Receiver must ask for any pieces that don't make it 
 */
function serveChunk(recipient, filepath, chunk, fsize) {
    var size = ((chunk + 1) * maxlength > fsize) ? fsize - ((chunk) * maxlength)  : maxlength;
    var buffer = new Buffer(size);
    fs.open(filepath, 'r', function (err, fd) {
        fs.read(fd, buffer, 0, buffer.length, chunk * size, function (err, bytesRead, buffer) {
            var base64Str = buffer.toString('base64');
            var resp = {
                chunk: chunk,
                body: base64Str,
            };
            lolChat.sendMessage(recipient, JSON.stringify(resp));
        })
    });
}
function sendFile(recipient, filepath) {
    var fsize = fs.statSync(filepath).size;
    for (var i = 0; i * maxlength < fsize; i++) {
        serveChunk(recipient, filepath, i, fsize);
    }
}
var recQ = {};
function getFile(sender, filepath) {
    if (recQ[sender]) {
        console.log("already awaiting file from: " + sender);
        return;
    }
    var req = {
        file: filepath,
    };
    lolChat.sendMessage(sender, JSON.stringify(req));
    // fsize isn't known until first response
    recQ[sender] = {
        fsize: 0,//size of file
        lastPacket: new Date(),// time of last packet receieved.
        // returns how many packets are left. Call on each packet that is received
        handlePacket: function (packet, parts, fsize, lastTime, packetsleft) {
            
            var ret = {
                left: packetsleft,
            };
            if (!parts[packet.chunk]) {
                parts[packet.chunk] = packet.body;
                ret.left--;
            }
            //packet is a server response, parts is an array of base64 strings.
            if ((new Date().getTime() - lastTime.getTime()) > timeoutMS) {
                // timed out. Re-request missing packets
                for (var i = 0; i < parts.length; i++) {
                    if (!parts[i]) {
                        var req = {
                            file: filepath,
                            chunk: i,
                        };
                        lolChat.sendMessage(sender, JSON.stringify(req));
                    }
                }
            }
            return ret;
        },
        respBodies: [],// Holds the base64 strings.
        packetsRemaining: 999,
    }
}
lolChat.events.on('incomingMessage', function (sname, message) {
    try {
        var req = JSON.parse(message);
        if (req.file) {
            // We are the server
            var filepath = config.webroot + "/" + req.file;
            fs.exists(filepath, function (exists) {
                if (exists) {
                    var response = {
                        status: 200,
                        filesize: fs.statSync(filepath).size,
                    };
                    lolChat.sendMessage(sname, JSON.stringify(response));
                    if (!req.chunk) {
                        sendFile(sname, filepath);
                    }
                    else {
                        serveChunk(sname, filepath, req.chunk, fs.statSync(filepath).size);
                    }
                }
                else {
                    var response = {
                        status: 404,
                        filesize: 0,
                    };
                    lolChat.sendMessage(sname, JSON.stringify(response));
                }
            });
        }
        else {
            // We have receieved a packet from the server
            if (recQ[sname]) {
                // we are expecting a packet
                if (req.filesize) { 
                    // Control packet
                    recQ[sname].fsize = req.filesize;
                    recQ[sname].packetsRemaining = Math.ceil(fileSize / maxlength);
                }
                else {
                    //Data packet
                    var status = recQ[sname].handlePacket(req, recQ[sname].respBodies , recQ[sname].fsize, recQ[sname].lastPacket, recQ[sname].packetsRemaining);
                    if (status.left === 0) {
                        // file is fully received. Save it
                        var forWrite = "";
                        recQ[sname].resBodies.forEach(function (v, i) { });
                        var maxi = Math.ceil(fileSize / maxlength);
                        for (var i = 0; i < maxi; i++) {
                            forWrite += recQ[sname].respBodies[i];
                        }
                        var decoded = new Buffer(forWrite, 'base64');
                        fs.writeFile(config.writeroot + "/" + asdf, decoded, function (err) {
                            delete recQ[sname];
                        });
                    }
                    else {
                        recQ[sname].lastPacket = new Date();
                    }
                }
            }
            else {
                // ignore it, we didn't ask for it
                console.log("I didnt even wannit");
            }
        }
    } catch (err) {
        var response = {
            status: 400,
            filesize: 0,
        };
        lolChat.sendMessage(sname, JSON.stringify(response));
    }
});

//Test message
//getFile('summonername', 'test.txt');
