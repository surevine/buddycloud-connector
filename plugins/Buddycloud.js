/*
 * Buddycloud Connector - Buddycloud Plugin
 * Copies your posts to and from Buddycloud
 *
 * Copyright 2014 Surevine Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ftw = require('xmpp-ftw');
var ftwbc = require('xmpp-ftw-buddycloud');
var Sockets = require('../lib/Sockets');
var Util = require('../lib/Util');
var Spritzr = require('spritzr');
var events = require('events');

var Buddycloud = function (config) {
    this.config = config;

    this.log = config.logging.app;
};

Spritzr.spritz(Buddycloud, events.EventEmitter);

Buddycloud.prototype.init = function () {
    this.log.info('Initialising Buddycloud Plugin');

    this.bcSockets = new Sockets();
    this.socket = this.bcSockets.socket;

    this.xmpp = new ftw.Xmpp(this.bcSockets.serverSocket);
    this.buddycloud = new ftwbc();

    this.xmpp.addListener(this.buddycloud);

    if (this.config.logging.xmpp) {
        this.xmpp.setLogger(this.config.logging.xmpp);
    }

    // Logging in kicks the whole darn thing off
    this.socket.emit('xmpp.login', this.config.auth);

    this.postsNode = '/user/' + this.config.channel + '/posts';

    return Util.autoConnectBuddycloud(this.socket);
};

Buddycloud.prototype.start = function () {
    this.log.info('Starting Buddycloud Plugin');

    // Hook up the incoming message event
    this.socket.on('xmpp.buddycloud.push.item', this._itemNotification.bind(this));
};

Buddycloud.prototype.sendMessage = function (data) {
    var content = data.payload;

    if (data.replyId) {
        var splitId = Buddycloud.parseFullId(data.replyId);

        if(splitId) {
            content['in-reply-to'] = {
                "ref": splitId.id
            };
        }
    }

    var node;

    if(data.channel) {
      node = '/user/' + data.channel + '/posts';
    } else {
      node = this.postsNode;
    }

    return this.socket.send('xmpp.buddycloud.publish', {
        node: node,
        content: content
    }).then(function (newPayload) {
        data.id = newPayload.id;

        return data;
    });
};

Buddycloud.prototype._itemNotification = function (notification) {
    if(notification.node != this.postsNode) {
        return;
    }

    var nodeArr = notification.node.split('/');

    var data = {
        id: notification.id,
        sender: notification.entry.atom.author.name,
        channel: nodeArr[2],
        payload: notification
    };

    if (notification.entry['in-reply-to']) {
        var mainId = Buddycloud.parseFullId(notification.id);

        data.replyId = 'tag:' + mainId.service + ',' + mainId.node + ',' + notification.entry['in-reply-to'].ref;
    }

    this.emit('messageReceived', data);
};

Buddycloud.parseNode = function(node) {
    var matches = id.match(/^\/user\/([^\/]+)\/(\w+)$/);

    if(!matches) {
        return null;
    }

    return {
        channel: matches[1],
        type: matches[2]
    };
};

Buddycloud.parseFullId = function(id) {
    var matches = id.match(/^tag:([^,]+),([^,]+),([^,]+)$/);

    if(!matches) {
        return null;
    }

    return {
        service: matches[1],
        node: matches[2],
        id: matches[3]
    };
};

module.exports = Buddycloud;