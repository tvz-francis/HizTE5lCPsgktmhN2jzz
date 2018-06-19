const express = require('express');
const app = express();
const sql = require('mssql');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const config = {
	user:'sa',
	password:'xyz0',
	server:'192.168.128.121\\sqlexpress',
	database:'APITestDB'
};

app.post('/', async (req,res) => {
	let SQL = '';

	try {
		const pool = await sql.connect(config);
		const transaction = pool.transaction();

		transaction.begin(async err => {

			transaction.on('rollback', aborted => {
				console.log('Aborted', aborted);
				sql.close();
				return res.status(400).send('Aborted');
			});
			transaction.on('commit', (result) => {
				console.log(result);
				sql.close();
				return res.status(400).send('Committed');
			});

			SQL = "INSERT INTO TBL_URIAGE_DTL_TEMP (SALES_NO) VALUES(@SALES_NO)";
			transaction.request()
			.input('SALES_NO',sql.Int,(Math.random() * 100) + 10)
			.query(SQL, async (err,result) => {
				if(err) return transaction.rollback();
				transaction.commit(result);
			});

		});

	} catch(err) {
		sql.close();
		return res.status(404).send('Not found.');
	}
});

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}`));