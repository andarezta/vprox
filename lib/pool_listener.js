const net = require('net');
const tls = require('tls');
const fs = require('fs');
require('log-timestamp')(function() { return '[' + new Date() + '] %s'; });

// TODO more stratum protocol support ???
//      handle too many rejected shares for pool connection


// global functions used by both miner_listener.js and this file
var getSafeString = function getSafeString(s) {
    return (s||"").toString().replace(/[^a-zA-Z0-9._,=\-\/\@=#]+/g, '');
}
var getSafeAddress = function getSafeAddress(s) {
    return getSafeString(s).split("/")[0].split("#")[0];
}
var getSafeNumber = function getSafeNumber(value) {
  return isNaN(num) ? 0 : num;
}

exports.getSafeString = getSafeString;
exports.getSafeAddress = getSafeAddress;
exports.getSafeNumber = getSafeNumber;

exports.newPoolConnection = function poolConnection(config) {
    let poolSocket;
    
    let subscribeObject = { id: 0,
        method: 'mining.subscribe',
        params: [ `xmrig/${config.version}`, null ]
    };
    
    let handleConnected = function () {
        poolSocket.rejects = 0;
        poolSocket.isConnected = true;

        poolSocket.peerEndpoint = poolSocket.remoteAddress + " " + poolSocket.remotePort.toString();

        poolSocket.setEncoding('ascii');
        poolSocket.setNoDelay(true);

        poolSocket.SendMessage(subscribeObject);
        poolSocket.sendExtraNonceSubscribe();

        // if present, force all miners to auth with specified proxy wallet
        if (config.wallet && typeof config.wallet === 'string' && config.wallet.length > 0) {
            let forcedAuthorizeObject = { id: 0,
                method: 'mining.authorize',
                params: [ getSafeAddress(config.wallet), getSafeString(config.password) ]
            };
            poolSocket.setAuthorizeObject(forcedAuthorizeObject);
            poolSocket.SendMessage(poolSocket.getAuthorizeObject());
            console.log(`Connected to ${config.pool.host}:${config.pool.port} for ${poolSocket.getMinerAddress()}`);

        } else {
            // if we already know the authorize from miner, send it ...
            if (poolSocket.getAuthorizeObject()) {
                poolSocket.SendMessage(poolSocket.getAuthorizeObject());
                console.log(`Connected to ${config.pool.host}:${config.pool.port} for ${poolSocket.getMinerAddress()}`);
            } else {
                console.log(`Connected to ${config.pool.host}:${config.pool.port} needs authorization from miner`);
            }
        }
    };
    
    if (config.pool.ssl === true) {
        let TLSoptions = {
            port: config.pool.port,
            host: config.pool.host,
            allowHalfOpen: false,
            rejectUnauthorized: (config.pool.rejectUnauthorized === true)
        };
        poolSocket = tls.connect(TLSoptions, handleConnected);

    } else {
        poolSocket = net.createConnection({
            port: config.pool.port,
            host: config.pool.host,
            allowHalfOpen: false,
        }, handleConnected);
    }
    
    poolSocket.on('error', function(err) {
        console.log(poolSocket.getPoolFriendlyName(), "pool socket error", err.code);
    });
    
    poolSocket.miners = new Map();
    
    poolSocket.minerAdd = function(minerId, socket) {
        if (poolSocket.closingTimeout) {
            clearTimeout(poolSocket.closingTimeout);
        }
        poolSocket.miners.set(minerId, socket);
        console.log("miner", minerId, "added to pool", poolSocket.getPoolFriendlyName());
    }
    poolSocket.minerDel = function(minerId) {
        if (poolSocket.miners.has(minerId)) {
            poolSocket.miners.delete(minerId);
            console.log("miner", minerId, "removed from pool", poolSocket.getPoolFriendlyName());
            if (poolSocket.miners.size == 0) {
                if (poolSocket.closingTimeout) {
                    clearTimeout(poolSocket.closingTimeout);
                }
                poolSocket.closingTimeout = setTimeout(()=>{
                    if (poolSocket.getIsConnected() !== false) {
                        console.log(poolSocket.getPoolFriendlyName(), "closing connection, tidak ada miner terkoneksi selama 15 seconds");
                        try {
                            poolSocket.destroy();
                        } catch (e) {
                        }
                    }
               }, 15000);
		//  }, 21600000);	
            }
        }
    }
    poolSocket.hasMiner = function(minerId) {
        return poolSocket.miners.has(minerId);
    };
    poolSocket.minerDelAll = function() {
        // notify all miner objects this pool is down
        for (let miner of poolSocket.miners.values()){
            miner.lostPool();
        }
        return poolSocket.miners.clear();
    };
    
    poolSocket.getPoolFriendlyName = function() {
        let connectedStr = poolSocket.getIsConnected()===false?" (disconnected)":"";
        if (poolSocket.miner) {
            return poolSocket.miner + connectedStr;
        }
        return config.pool.host + connectedStr;
    }
    
    poolSocket.getIsConnected = function () {
        return poolSocket.isConnected;
    }
    poolSocket.getMinerAddress = function () {
        return poolSocket.miner;
    }
    poolSocket.getAuthorizeObject = function () {
        return poolSocket.authorizeObject;
    }
    poolSocket.setAuthorizeObject = function (object) {
        poolSocket.authorizeObject = object;
        poolSocket.miner = getSafeAddress(object.params[0]);
    }
    poolSocket.getSubscribeObjectResponse = function () {
        return poolSocket.subscribeResponseObject;
    }
    poolSocket.getShareTargetObject = function () {
        return poolSocket.setTargetObject;
    }
    poolSocket.getNotifyObject = function () {
        return poolSocket.notifyObject;
    }
    poolSocket.getExtraNonce = function () {
        return poolSocket.extraNonce;
    }
    poolSocket.isExtraNonceSubscribed = function() {
        return poolSocket.extraNonceSubscribed;
    };
    poolSocket.sendExtraNonceSubscribe = function () {
        if (!poolSocket.extraNonceSubscribed) {
            poolSocket.extraNonceSubscribed = true;
            poolSocket.SendMessage({ id: 0, method: 'mining.extranonce.subscribe', params: [] });
        }
    }
    poolSocket.sendPBaasSubscribe = function () {
        if (!poolSocket.pbaasSubscribed) {
            poolSocket.pbaasSubscribed = true;
            poolSocket.SendMessage({ id: 0, method: 'mining.pbaas.subscribe', params: [] });
        }
    }
    poolSocket.SendMessage = function (obj) {
        //console.log("to pool", obj);
        return poolSocket.write(JSON.stringify(obj) + "\n");
    }
    
    // main pool socket
    let data = "";
    poolSocket.on('data', (chunk) => {
        if (typeof chunk !== 'string') {
            return;
        }
        data += chunk;
        let di = data.indexOf('\n');
        while (di > -1) {
            let message = data.substr(0,di);
            data = data.substr(di+1);
            di = data.indexOf('\n');
            let obj;
            try {
                obj = JSON.parse(message);
            } catch(e) {
                console.log(poolSocket.getPoolFriendlyName(), "gagal meneruskan pesan ke pool", e);
                return;
            }
            // process messages
            if (obj.id || obj.id === 0) {
                // forward to specific miner
                let miner = undefined;
                let minerId = obj.id;
                if (minerId && poolSocket.miners.has(minerId)) {
                    miner = poolSocket.miners.get(minerId);
                    // get message id used by miner
                    let msgId = miner.getMsgId();
                    if (msgId) {
                        obj.id = msgId;
                        miner.write(JSON.stringify(obj) + '\n');
                        //console.log("forward to miner:", minerId, obj);
                    }
                }
                // check for mining.subscribe response
                if (Array.isArray(obj.result) && obj.result.length == 2) {
                    poolSocket.extraNonce = obj.result[1];
                    poolSocket.subscribeResponseObject = obj;
                    // forward data to all miners of this pool
                    for (let miner of poolSocket.miners.values()){
                        miner.sendExtraNonce();
                    }
                    console.log(poolSocket.getPoolFriendlyName(), "pool assigned nonce", poolSocket.extraNonce);
                    
                } else if (obj.id) {
                    // check accepted share result
                    if (obj.error) {
                        // console.log('miner', minerId, 'share rejected id', obj.id, obj.error, "from ip", miner?miner.peerEndpoint:"unknown", "FUCK");
                        poolSocket.rejects++;
                        if (poolSocket.rejects > 3000000) {
                            console.log(poolSocket.getPoolFriendlyName(), 'WARN, terlalu banyak rejected shares !!!');
                            poolSocket.rejects = 0;
                        }
                        if (miner) {
                            if (!miner.isExtraNonceSubscribed() && poolSocket.rejects > 3000000) {
                                console.log('miner', minerId, "WARN, miner software tidak dikenal (", miner.getMinerSoftware(), ") from ip", miner.peerEndpoint);
                            }
                        }
                    } else if (obj.result === true) {
                        // console.log ('miner', minerId, 'share accepted id', obj.id, miner?miner.peerEndpoint:"", "YES");
                        poolSocket.rejects = 0;
                    }
                }

            } else if (obj.method === "mining.set_target" || obj.method === "mining.notify") {
                // cache job and target
                if (obj.method === 'mining.notify') {
                    poolSocket.notifyObject = obj;
                    let now = Date.now();
                    // forward data to all miners of this pool
                    for (let miner of poolSocket.miners.values()){
                        miner.setNotifyObject(obj, now);
                    }
                }
                else {
                    poolSocket.setTargetObject = obj;
                    // forward data to all miners of this pool
                    for (let miner of poolSocket.miners.values()){
                        miner.setShareTargetObject(obj);
                    }
                }
            } else if (obj.method === "mining.set_extranonce") {
                poolSocket.extraNonce = obj.params[0];
                // forward data to all miners of this pool
                for (let miner of poolSocket.miners.values()){
                    miner.sendExtraNonce();
                }
                
            } else {
                
                console.log(poolSocket.getPoolFriendlyName(), "respons pool tidak diketahui", obj);
                
            }
        }
    });
    poolSocket.on('close', function() {
        console.log(poolSocket.getPoolFriendlyName(), "koneksi pool terputus");
        poolSocket.rejects = 0;
        poolSocket.isConnected = false;
        poolSocket.extraNonce = undefined;
        poolSocket.authorizeObject = undefined;
        poolSocket.subscribeResponseObject = undefined;
        poolSocket.minerDelAll();
    });
	return poolSocket;
};
