const server = require('./server');

server.app.post('/sample/api',(req,res) => {
	console.log('HI');
});

module.exports = {
	route:return server
};