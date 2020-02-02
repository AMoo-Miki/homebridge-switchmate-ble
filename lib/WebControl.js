const http = require('http');
const OutletAccessory = require('./OutletAccessory');

const URL_MATCHER = /^\/([^\/:]+)(?::([0-2]))?(\/?)$/;

class WebControl {
    constructor() {
        this.server = http.createServer((req, res) => {
            const authUserPass = Buffer.from((req.headers['authorization'] || '').replace(/^.+?([^\s]+)$/, '$1'), 'base64').toString();
            if ((this.authUserPass || '') !== authUserPass) {
                res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Switchmate"'});
                return res.end();
            }

            let match, _next, device;
            if (req.method === 'GET') {
                this.platform.log('Incoming URL', req.url);
                if ((match = req.url.match(URL_MATCHER)) !== null && this.platform.cachedAccessories.has(match[1])) {
                    device = this.platform.cachedAccessories.get(match[1]);
                    _next = (err, data) => {
                        if (err) {
                            res.writeHead(400, {'Content-Type': 'text/plain'});
                        } else {
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.write(JSON.stringify({device: match[1], state: data}));
                        }
                        return res.end();
                    };
                    console.log('-------\n', match[2], '\n-------');
                    switch (match[2]) {
                        case '0':
                            return device.getLight(_next);

                        case '1':
                            return device.getState(1, _next);

                        case '2':
                            return device.getState(2, _next);

                        case undefined:
                            return device.getState(_next);
                    }

                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    return res.end();
                }

                res.writeHead(200, {'Content-Type': 'application/json'});
                const result = {};
                this.platform.cachedAccessories.forEach((value, key) => {
                    if (value instanceof OutletAccessory) {
                        result[key + ':0'] = value.context.name + ' Light';
                        result[key + ':1'] = value.context.name + ' 1';
                        result[key + ':2'] = value.context.name + ' 2';
                    } else {
                        result[key] = value.context.name;
                    }
                });
                res.write(JSON.stringify(result));
                return res.end();
            } else if (req.method === 'PUT') {
                if ((match = req.url.match(URL_MATCHER)) !== null && this.platform.cachedAccessories.has(match[1])) {
                    device = this.platform.cachedAccessories.get(match[1]);
                    _next = (err, data) => {
                        if (err) {
                            res.writeHead(400, {'Content-Type': 'text/plain'});
                        } else {
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.write(JSON.stringify({device: match[1], result: data}));
                        }
                        return res.end();
                    };

                    let body = '';
                    req.on('data', data => {
                        body += data;
                    });
                    req.on('end', () => {
                        try {
                            const msg = JSON.parse(body);
                            if (typeof msg.state === 'boolean') {
                                switch (match[2]) {
                                    case '0':
                                        return device.setLight(msg.state, _next);

                                    case '1':
                                        return device.setState(1, msg.state, _next);

                                    case '2':
                                        return device.setState(2, msg.state, _next);

                                    case undefined:
                                        return device.setState(msg.state, _next);
                                }
                                res.writeHead(400, {'Content-Type': 'text/plain'});
                                return res.end();
                            }
                        } catch (ex) {console.log(ex)}

                        res.writeHead(400, {'Content-Type': 'text/plain'});
                        res.end();
                    });
                    return;
                }
            }

            res.writeHead(400, {'Content-Type': 'text/plain'});
            res.end();
        });
    }

    start(platform) {
        const {config: {http: port, httpUser: user, httpPass: pass}} = {...platform};
        this.platform = platform;

        this.platform.log('Going to start Web Server on port %d...', isFinite(port) ? port : 8282);

        if (user && pass) this.authUserPass = user + ':' + pass;
        this.server.listen(isFinite(port) ? port : 8282, err => {
            if (err) return this.platform.log.error('Failed to start Web Server!');
            this.platform.log('Web Server started on %d', isFinite(port) ? port : 8282);
        });

        return this;
    }
}

module.exports = new WebControl();