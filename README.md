
## Setup
    sudo apt install nodejs npm
    git clone 
    cd vprox
    npm install

## Modify config.js

### Proxy Setup

    "stratumPort": 8000,
    
**NOTE**: stratum port can not be the same as pool port  
    
#### Proxy TLS/SSL Encryption
If needed, generate self sign certificate to use with proxy stratum port

    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 3650 -nodes -subj '/CN=localhost'  

#### Enable TLS/SSL config

    "stratumSSL": {
        "enabled": true,
        "key" : "key.pem",
        "cert" : "cert.pem"
    },

### Pool Connection

    "pool" : {
      "host" : "na.luckpool.net",
      "port" : 3958,
      "ssl"  :  true
    }

#### Miner Authorization
By default, authorization from miner will be used to create pool connections for each unique miner address.  
  
Optionally, you may force all miners to use the specified proxy wallet.

    "wallet": "WALLET_ADDRESS",
    "password": "x"

## Run
    node proxy.js
