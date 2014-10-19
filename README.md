League-of-Legends-File-Server

Stand-alone NodeJS application to send and receive files over League of Legend's chat using XMPP

For Windows clients, you probably will need to use

    npm install --msvs_version=2012 node-xmpp
You can ask for a file from a server with

    {"file":"filename"}
or by using the getFile function.
