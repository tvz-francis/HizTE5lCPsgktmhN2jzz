const express = require('express');
const app = express();
const sql = require('mssql');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 3000;
const async = require('async');
const fs = require('fs');

app.use(bodyParser.json());

const config = {
	user:'sa',
	password:'xyz0',
	server:'192.168.128.121\\sqlexpress',
	database:'APITestDB'
};

const logFile = __dirname+'/logs';

app.post('/', async (req,res) => {
	let SQL = '';

	try {
		const pool = await sql.connect(config);
		const transaction = pool.transaction();

		transaction.begin(async err => {

			transaction.on('rollback', async aborted => {
				LOGGEDFILE(aborted);
				sql.close();
				return res.status(400).send('Aborted');
			});
			transaction.on('commit', async (result) => {
				console.log('Transaction committed');
				sql.close();
				return res.status(400).send('Committed');
			});

			const request = new sql.Request(transaction);
			// request.stream = true;
			SQL = "INSERT INTO TBL_URIAGE_DTL_TEMPs (SALES_NO) VALUES(@SALES_NO)";
			let _reqreq = await request
			.input('SALES_NO',sql.Int,(Math.random() * 100) + 10)
			.query(SQL, async (err,result) => {
				if(err) return transaction.rollback();
				transaction.commit();
			});

			// request.on('done', result => {
			// 	transaction.commit();
			// });

		});

	} catch(err) {
		sql.close();
		return res.status(404).send('Not found.');
	}
});

app.post('/readfile',async(req,res) => {

});

function LOGGEDFILE(data) {
	const dateTime = new Date();
	const toLocaleTimeString = dateTime.toLocaleTimeString();
	const toLocaleDateString = dateTime.toLocaleDateString();
	if(!fs.existsSync(logFile)) {
		fs.mkdirSync(logFile,'0777');
	}
	fs.appendFile(`${logFile}/${toLocaleDateString}.txt`, `\n${toLocaleTimeString}:\t${data}\n`, (err) => {
		if(err) return err;
		return true;
	});
}

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}`));

