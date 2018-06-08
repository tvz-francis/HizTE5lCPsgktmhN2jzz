const express = require('express');
const app = express();
const sql = require('mssql');
const PORT = process.env.PORT || 3002;

const config = {
    user:'sa',
	password:'xyz0',
	server:'192.168.128.121\\sqlexpress',
	database:'APITestDB'
};

let jsonSales = {
	"username": "acrossadmin",
	"password": "xyz00zyx",
	"json": [
	  {
		"SHOP_FC_NO": "99997",
		"SALES_NO": "000000044484",
		"MEMBER_ID": "999910000002",
		"LOGIN_DATE": "2018-05-16 14:12:09",
		"SEISAN_DATE": "2018-05-16 14:13:39",
		"USE_MIN": 1,
		"MEMBER_NM": "テスト 10ごう",
		"MEMBER_YEARS_OLD": 18,
		"MEMBER_SEX": 1,
		"MEMBER_FLG": 1,
		"SMOKER_FLG": 0,
		"RED_FLG": 1,
		"NYUTEN_CNT": 0,
		"SEAT_KBN": 0,
		"SEAT_BUNRUI": 0,
		"TOTAL_BASE_MIN": 0,
		"PACK_END_TIME": null,
		"SHOUKEI_YEN": 150,
		"GOUKEI_YEN": 150,
		"MAEUKE_YEN": 0,
		"AZUKARI_YEN": 150,
		"CHANGE_YEN": 0,
		"USE_POINT_YEN": 0,
		"URIAGE_YEN": 150,
		"URIAGE_KBN": 0,
		"GASSAN_SALES_NO": null,
		"GASSAN_SALES_SEQ": 0,
		"SEISAN_FLG": 1,
		"CLOSE_FLG": 0,
		"CLOSE_DATE": null,
		"DELETE_FLG": 0,
		"ADD_POINT": 0,
		"TAX_YEN": 11,
		"TAX_KBN": 0,
		"USE_POINT": 0,
		"MEMBER_LEVEL": 0,
		"SEAT_NO": "0002",
		"INPUT_STAFF_ID": "0000009cr055",
		"INPUT_DATE": "2018-05-16 14:12:09",
		"UPDATE_STAFF_ID": "0000009cr055",
		"UPDATE_DATE": "2018-05-16 14:13:50",
		"NEW_MEMBER_FLG": 0,
		"APP_LOGIN_FLG": 0,
		"LOGIN_HOLIDAY_FLG": "0",
		"SEISAN_HOLIDAY_FLG": "0",
		"TBL_URIAGE_DTL": [
		  {
			"SHOP_FC_NO": "99997",
			"SALES_NO": "000000044484",
			"SEQ": 0,
			"ITEM_SEQ": 0,
			"ITEM_ID": "000000000150",
			"ITEM_NM": "30分",
			"ITEM_KBN": 0,
			"FOOD_KBN": null,
			"TAX_KBN": 0,
			"ITEM_QU": 1,
			"ITEM_PRICE": 150,
			"BASE_MIN": 30,
			"TOTAL_YEN": 150,
			"SEISAN_DATE": "2018-05-16 14:13:39",
			"SEISAN_FLG": 1,
			"MAEBARAI_FLG": 0,
			"DELETE_FLG": 0,
			"RETURN_QU": 0,
			"SEAT_USE_START_DATE": "2018-05-16 14:12:09",
			"SEAT_NO": "0002",
			"INPUT_STAFF_ID": "0000009cr055",
			"INPUT_DATE": "2018-05-16 14:12:09",
			"UPDATE_STAFF_ID": "0000009cr055",
			"UPDATE_DATE": "2018-05-16 14:13:55",
			"SEISAN_HOLIDAY_FLG": "0"
		  }
		],
		"TBL_SEAT_STATUS": [
		  {
			"SHOP_FC_NO": "99997",
			"SEAT_NO": "0002",
			"SEQ": 0,
			"SEAT_USE_SEQ": 224,
			"SEAT_KBN": 0,
			"SEAT_BUNRUI": 0,
			"SALES_NO": "000000044484",
			"MEMBER_ID": "999910000002",
			"VISITOR_ID": null,
			"VISITOR_CNT": 1,
			"SEAT_ITEM_ID": "000000000150",
			"MEMBER_NM": "テスト 10ごう",
			"MEMBER_YEARS_OLD": 18,
			"MEMBER_SEX": 1,
			"RED_FLG": 1,
			"LOGIN_DATE": "2018-05-16 14:12:09",
			"USE_START_DATE": "2018-05-16 14:12:09",
			"BASE_MIN": 30,
			"EXTENSION_MIN": 0,
			"SMOKER_FLG": 0,
			"CALL_FLG": 0,
			"PC_FLG": 0,
			"PACK_END_TIME": null,
			"FREE_TIME_FLG": 0,
			"SEISAN_DATE": "2018-05-16 14:13:39",
			"SEISAN_FLG": 1,
			"DELETE_FLG": 0,
			"INPUT_STAFF_ID": "0000009cr055",
			"INPUT_DATE": "2018-05-16 14:12:09",
			"UPDATE_STAFF_ID": "0000009cr055",
			"UPDATE_DATE": "2018-05-16 14:13:56",
			"LOGIN_HOLIDAY_FLG": "0",
			"SEISAN_HOLIDAY_FLG": "0"
		  }
		],
		"TBL_VISITOR": null,
		"TBL_CREDIT_RIREKI": null,
		"MST_SEAT": null,
		"TBL_GASSAN": null
	  }
	]
  };

const request = require('request');
const request_opt = {
	method: 'post',
	body: jsonSales,
	json: true,
	url: 'http://acrossweb.net/upload/sales'
};
let returnCode = 0;

try {

	let postreq = request(request_opt,(err, httpResponse, body) => {
		if(err) ERROR_LOGGER(0,'VERIFICATION ERROR\n'+err);
		// console.log(body);
		// return body;

		return new Promise((resolve,reject) => {
			resolve(body);
		});

		// if(body.code == 1) {
		// 	let data = body.coupon;
	
		// 	return_json = {
		// 		"COUPON_ID":data.item_id,
		// 		"COUPON_NM":data.item_nm,
		// 		"PRICE_TYPE":data.price_flg,
		// 		"ITEM_KBN":data.coupon_kbn
		// 	};
		// 	if(data.price_flg == 1) {
		// 		return_json['COUPON_PRICE'] = data.item_yen;
		// 	} else{
		// 		return_json['COUPON_DISCOUNT'] = data.item_yen;
		// 	}
		// 	res.json(return_json);
		// } else {
		// 	res.json(CNST_ERROR_CODE.error_4);
		// }

	});

	console.log(postreq);

} catch(err) {
	ERROR_LOGGER(0,'UPLOAD_SALES\n');
}
console.log(returnCode);
return returnCode;


app.post('/testFunc', async(req,res) => {
	let committed = false;
	const pool = await sql.connect(config);
	const DBTransaction = require('./DBTransaction').DB.Transaction;

	try {

		DBTransaction.Pool = pool;
		DBTransaction.Begin = (func) => {

			func((cb) => {

				return new Promise(async(resolve,reject) => {
					let insert_1 = await pool.request()
					.query("INSERT INTO TBL_ZAIKO (ZAIKO_ID) VALUES('000000000132')",(err,result) => {
						if(err) reject(err);
						resolve(result);
					});
				});

				
			});

		};

		// console.log(DBTransaction);

		// const transaction = pool.transaction();
		// let rolledBack = false;

		// transaction.begin(async err => {
		// 	if(err) throw err;

		// 	transaction.on('rollback',aborted => {
		// 		rolledBack = true;
		// 		console.log('Transaction on rollback');
		// 		sql.close();
		// 	});
			
		// });

		// let insert_1 = await pool.request()
		// .query("INSERT INTO TBL_ZAIKO (ZAIKO_ID) VALUES('000000000131')",(err,result) => {
		// 	if(err) {
		// 		if(!rolledBack) {
		// 			transaction.rollback(err => {
		// 				if(err) throw err;
		// 				console.log('Transaction rolledback');
		// 			});
		// 		}
		// 	} else {
		// 		transaction.commit(err => {
		// 			if(err) throw err;
		// 			console.log('Transaction committed');
		// 			sql.close();
		// 		});
		// 	}
		// });

		

	} catch(err) {
		console.log(err);
	}

	
	
	res.end();

});

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));