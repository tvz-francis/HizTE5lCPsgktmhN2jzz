const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const sql = require('mssql');

app.use(bodyParser.json());

module.exports = {
	config:{
	    user:'sa',
		password:'xyz0',
		server:'192.168.128.121\\sqlexpress',
		database:'POS-_-00141-_-4_04'
	},
	connection:new sql.ConnectionPool({
		user:'sa',
		password:'xyz0',
		server:'192.168.128.121\\sqlexpress',
		database:'POS-_-00141-_-4_04'
	}),
	app:app,
	sql:sql
};

app.listen(3000, () => console.log('Example app listening on port 3000!'));