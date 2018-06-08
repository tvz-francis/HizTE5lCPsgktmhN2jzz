const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;
const bodyParser = require('body-parser');
const config = require('./classes/dbconfig');
const sql = require('mssql');
const error = require('./classes/error');
const credentials = require('./classes/credentials');

let AUTH_LOG = (req,res,next) => {
  res.removeHeader('X-Powered-By');
  if(req.method != 'POST') return res.status(400).end();
  for(let i in req.body) {
    req.body[i] = req.body[i].replace(/([^a-zA-Z0-9])+/g,'0');
  }
  if(credentials.CNST_USERNAME != req.body.username && credentials.CNST_PASSWORD != req.body.password) return res.status(200).send(error.type_3);
  next();
};
app.use(bodyParser.json());
app.use(AUTH_LOG);

app.post('/api/sales2', (req,res) => {
  let rules = { 'seat_no':'Required Seat no' };

  postValidation(rules,req.body)
  .then(async() => {
    const pool = await sql.connect(config);
    let SQL = '';
    let seat_no = req.body.seat_no;

    let TBL_URIAGE = await pool.request()
    .input('seatno', sql.VarChar, seat_no)
    .query("SELECT * FROM [TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
    if(TBL_URIAGE.recordset.length === 0) {
      sql.close();
      return res.status(200).send(error.type_2)
    }
    
    sql.close();
  })
  .catch(err => {
    console.log(err);
    sql.close();
    res.status(200).send(error.type_11)
  });

});

function postValidation(rules,postData) {
	return new Promise((resolve,reject) => {
		for(let iRules in rules) {
			if(!postData[iRules]) {
				reject(rules[iRules]);
				break;
			}
		}
		resolve();
	});
}

app.listen(PORT, () => console.log(`Server is now running on port ${PORT}`));
