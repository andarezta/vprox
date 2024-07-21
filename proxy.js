const cluster = require("cluster");
// const totalCPUs = require("os").cpus().length;
// const totalCPUs = 1;
const minerListener = require('./lib/miner_listener.js');

// const config = require('./data/config-vipor.json');
 const config = require('./data/config-varrr.json');
// const config = require('./data/config-zergshib.json');

config.version = "6.21.0";

// TODO, stratumProxy/poolConnection engine (50%)
//       api/stats engine (0%)
//       validate config

    //console.log(`Worker ${process.pid} is running`);

    // example fork inter-process communications
    process.on('message', function(msg) {
        console.log('from master:', msg);
    });
    //process.send({chat: "Hello master from worker!"});

    if (!config.notifyTimeoutMs) {
        config.notifyTimeoutMs = 15000;
    }

    // start stratum mining server for this fork
    minerListener.createMiningListener(config);
    
    // TODO, monitor ssl certificates for updates and udpdate our listener's TLS options ...

