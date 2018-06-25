const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const sql = require('mssql');
// const mysql = require('mysql');
// const dateFormat = require('dateformat');
// const querystring = require('querystring');
// var each = require('foreach');
const CNST_ERROR_CODE = {
	'error_0':'0000',
	'error_1':'0001',
	'error_2':'0002',
	'error_3':'0003',
	'error_4':'0004',
	'error_5':'0005',
	'error_6':'0006',
	'error_7':'0007',
	'error_8':'0008',
	'error_9':'0009',
	'error_10':'0010',
	'error_11':'9999'
};
const CNST_STAFF_ID = "00000629au05";
const CNST_SEAT_ITEM_ID = "999920176262";
const CNST_USERNAME = 'admin';
const CNST_PASSWORD = 'admin123';

app.use(bodyParser.json());

let userPassValidation = function(req,res,next) {
	if(req.method != 'POST') res.end();
	try{
		if(req.body.username == CNST_USERNAME && req.body.password == CNST_PASSWORD) {
			next();
		} else {
			throw 'Username and Password authentication failed.';
		}
	} catch(err) {
		console.log(err);
		res.status(400).send(CNST_ERROR_CODE.error_3);
		return;
	}
};

app.use(userPassValidation);

const config = {
	user:'sa',
	password:'xyz0',
	server:'192.168.128.121\\sqlexpress',
	database:'APITestDB'
};

//#region API-SALES
app.post('/api/sales', async (req, res) => {
	let return_json = {};
	let return_error = {};
	

	let param = req.body;
	let rules = {
		'username':'user',
		'password':'pass',
		'seat_no':'seat'
	};
	let error = 0;

	for(let i in rules) {
		if(!req.body[i]) {
			const logMsg = `API-SALES: Bad Request`;
			const data = CNST_ERROR_CODE.error_3;
			MONITOR_LOG(400,logMsg,data,res);
		}
	}

	let pool = await sql.connect(config);

	// POST DATE / END DATE
	let SEISAN_DATE = dateTimeNow();

	let TBL_URIAGE_DTL_CLASS = [];
	let username = param.username;
	let password = param.password;
	let seat_no = param.seat_no;
	let items = [];
	return_json.POSTED_DATE = SEISAN_DATE;
	return_json.SALES_DATA = [];
	return_json.ALL_TOTAL = 0;
	return_json.ALL_TAX = 0;
	let member_flg = '';
	let getSEQ = 0;

	let _uriage = '';
	let autoPackClass = [];
	let uriageDtlToToken = [];
	let tempUriageDtl = {};
	let total_price = 0;

	let MST_SHOP = await pool.request()
	.query("SELECT * FROM MST_SHOP;");
	MST_SHOP = MST_SHOP.recordset[0];
	MST_SHOP.SHOP_EX_FREE = (MST_SHOP.SHOP_EX_FREE * 60);
	SEISAN_DATE = new Date(SEISAN_DATE);
	SEISAN_DATE = new Date(SEISAN_DATE.setSeconds(SEISAN_DATE.getSeconds()-(MST_SHOP.SHOP_EX_FREE)));
	SEISAN_DATE = getDateTimeToString(SEISAN_DATE);
	
	let _hash = await hashCode(dateTimeNow());

	let ungroupedTblUriageDtlTemp = [];

	try {
		// CHECK SEAT_NO DATA
		let SEAT_NO = await pool.request()
		.input('SEAT_NO', sql.NVarChar, req.body.seat_no)
		.query("SELECT * FROM TBL_URIAGE WHERE SEAT_NO = @SEAT_NO AND DELETE_FLG = 0 AND SEISAN_FLG = 0");
		if(SEAT_NO.recordset.length === 0) {
			sql.close();
			return res.status(404).json(CNST_ERROR_CODE.error_2);
		}

		// CHECK SEAT STATUS return IF 2.
		let SEAT_STATUS = await pool.request()
		.input('SEAT_NO', sql.NVarChar, req.body.seat_no)
		.query("SELECT SEAT_STATUS FROM MST_SEAT WHERE SEAT_NO = @SEAT_NO");
		if(SEAT_STATUS.recordset[0].SEAT_STATUS == 2) {
			sql.close();
			return res.status(404).json(CNST_ERROR_CODE.error_5);
		}

		// UPDATE SEAT_STATUS
		let SQL = "UPDATE MST_SEAT SET SEAT_STATUS = @SEAT_STATUS, UPDATE_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID WHERE SEAT_NO = @SEAT_NO";
		let UPDATE_MST_SEAT = await pool.request()
		.input("SEAT_STATUS", sql.Int, 2)
		.input("SEAT_NO", sql.VarChar, param.seat_no)
		.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
		.query(SQL);

		let result1 = await pool.request()
		.input('seatno', sql.Int, seat_no)
		.query("SELECT * FROM [TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
		if(result1.recordset.length > 0) {
			for(let i in result1.recordset) {
				let obj = result1.recordset[i];
					member_flg = obj.MEMBER_FLG;
				_uriage = obj;
				let GETEXT_AUTOPACK_HT = await GET_EXT_AUTOPACK_HT(await TBL_URIAGE_DTL(obj.SALES_NO),obj);
				for(let x in GETEXT_AUTOPACK_HT) {
					let xObj = GETEXT_AUTOPACK_HT[x];
					ungroupedTblUriageDtlTemp.push(xObj);
				}

				let tblUriageData = {
					"SALES_NO":obj.SALES_NO,
					"MEMBER_ID":obj.MEMBER_ID,
					"MEMBER_FLG":obj.MEMBER_FLG,
					"LOGIN_DATE":convert_datetime(obj.LOGIN_DATE),
					"SEISAN_DATE":SEISAN_DATE,
					"USE_MIN":await SEAT_ITEM_USE_MIN(obj.SALES_NO,SEISAN_DATE),
					"MEMBER_NM":obj.MEMBER_NM,
					"MEMBER_SEX":obj.MEMBER_SEX,
					"MAEUKE_YEN":obj.MAEUKE_YEN,
					"SEAT_NO":obj.SEAT_NO,
					"UPDATE_STAFF_ID":CNST_STAFF_ID,
					"SHOUKEI_YEN":0,
					"GOUKEI_YEN":0,
					"URIAGE_YEN":0,
					"TAX_YEN":0,
					"AZUKARI_YEN":0,
					"CHANGE_YEN":0
				}

				return_json.SALES_DATA.push({
					"TBL_URIAGE":tblUriageData,
					"TBL_URIAGE_DTL":[],
					"TBL_SEAT_STATUS":await TBL_SEAT_STATUS(obj.SALES_NO),
					"MST_SEAT":await MST_SEAT(obj.SEAT_NO)
				});
				
			}

			let groupedSalesNo = await GROUPED_SALES_NO(ungroupedTblUriageDtlTemp);
			let groupedItem = await GROUPED_ITEM(groupedSalesNo);
			return_json.ALL_TOTAL = total_price;
			return_json.ALL_TAX = await compute_TAX_YEN(total_price);
		}

		for(let ii in return_json.SALES_DATA) {
			let OBJO = return_json.SALES_DATA[ii];
			let __COMPUTE = await COMPUTE_TOTAL_YEN(OBJO.TBL_URIAGE_DTL,OBJO.TBL_URIAGE);
		}
		const logMsg = `API-SALES: Success request`;
		const data = return_json;
		MONITOR_LOG(200,logMsg,data,res,true);
	} catch(err) {
		sendError(CNST_ERROR_CODE.error_11,'get tbl uriage\n'+err);
	}

	async function GROUPED_SALES_NO(uriageDtl) {
		let groupedSalesNo = {};
		for(let x in uriageDtl) {
			let xObj = uriageDtl[x];
			groupedSalesNo[xObj.SALES_NO] = [];
			for(let y in uriageDtl) {
				let yObj = uriageDtl[y];
				if(xObj.SALES_NO == yObj.SALES_NO) {
					groupedSalesNo[xObj.SALES_NO].push(yObj);
				}
			}
		}
		return groupedSalesNo;
	}

	async function GROUPED_ITEM(data) {

		try {
			for(let i in data) {
				let iObj = data[i];
				let SEQ = 0;
				for(let x in iObj) {
					if(iObj[x] != 'undefined') {
						let xObj = iObj[x];
						for(let y in iObj) {
							let yObj = iObj[y];
							if(x != y && xObj.ITEM_ID == yObj.ITEM_ID && xObj.ITEM_KBN == yObj.ITEM_KBN && xObj.ITEM_NM == yObj.ITEM_NM && xObj.ITEM_PRICE == yObj.ITEM_PRICE && xObj.SALES_NO == yObj.SALES_NO) {
								xObj.ITEM_QU += yObj.ITEM_QU;
								xObj.TOTAL_YEN += yObj.TOTAL_YEN;
								iObj.splice(y,1,'undefined');
							}
						}
						xObj.ITEM_SEQ = SEQ;

						for(let iSALES_DATA in return_json.SALES_DATA) {
							let item = return_json.SALES_DATA[iSALES_DATA];
							if(item.TBL_URIAGE.SALES_NO == xObj.SALES_NO) {
								xObj['SEISAN_DATE'] = SEISAN_DATE;
								item.TBL_URIAGE_DTL.push(xObj);
							}
						}
						iObj.splice(x,1,'undefined');
						SEQ++;
					}
				}
				
			}



		} catch(err) {
			sendError(0,'GROUPED_ITEM: '+err);
		}
		
	}

	async function TBL_SEAT_STATUS(salesNo) {
		let SQL = "";
		let return_data = {};
		try{
			SQL = "SELECT * FROM TBL_SEAT_STATUS WHERE SALES_NO = @SALES_NO AND SEISAN_FLG = 0 AND DELETE_FLG = 0";
			let TBL_SEAT_STATUS = await pool.request()
			.input('SALES_NO', sql.NVarChar,salesNo)
			.query(SQL);
			TBL_SEAT_STATUS = TBL_SEAT_STATUS.recordset[0];
			return_data.SALES_NO = TBL_SEAT_STATUS.SALES_NO;
			return_data.SEISAN_DATE = SEISAN_DATE;
			// return_data.SEISAN_FLG = TBL_SEAT_STATUS.SEISAN_FLG;
			return_data.UPDATE_STAFF_ID = CNST_STAFF_ID;
			// return_data.UPDATE_DATE = SEISAN_DATE;
		} catch(err) {
			console.log(err);
			sql.close();
			return res.status(404).send(CNST_ERROR_CODE.error_11);
		}
		return return_data;
	}

	async function MST_SEAT(seatNo) {
		let SQL = "";
		let return_data = {};
		try{
			SQL = "SELECT * FROM MST_SEAT WHERE SEAT_NO = @SEAT_NO";
			let MST_SEAT = await pool.request()
			.input('SEAT_NO', sql.NVarChar,seatNo)
			.query(SQL);
			MST_SEAT = MST_SEAT.recordset[0];
			return_data.SEAT_NO = MST_SEAT.SEAT_NO;
			return_data.SEAT_STATUS = MST_SEAT.SEAT_STATUS;
			return_data.LOGIN_CNT = MST_SEAT.LOGIN_CNT;
		} catch(err) {
			console.log(err);
			sql.close();
			return res.status(404).send(CNST_ERROR_CODE.error_11);
		}
		return return_data;
	}

	async function ExCurrentDate(data,edp,uriageDtl,uriage) {

		let exItemQu = 0;
		let exItemPrice = 0;
		let itemSequence = 0;
		let exItemMin = 0;

		let endDate = SEISAN_DATE;
		let index = 0;
		
		try {
			for(let i in data) {
				let obj = data[i];
				let SEAT_USE_START_DATE = obj.SEAT_USE_START_DATE;
				let exCurrentDate = (obj.PACK_END_TIME == '') ? convert_datetime(new Date(SEAT_USE_START_DATE.setSeconds(SEAT_USE_START_DATE.getSeconds()+(obj.SEAT_BASE_MIN * 60)))):edp;
				do {
					if(index == 0) {
						itemSequence = obj.ITEM_SEQ;
						exCurrentDate = (obj.PACK_END_TIME == '') ? convert_datetime(new Date(SEAT_USE_START_DATE.setSeconds(SEAT_USE_START_DATE.getSeconds()+(obj.SEAT_BASE_MIN * 60)))):edp;
					} else {
						exCurrentDate = new Date(exCurrentDate);
						exCurrentDate = getDateTimeToString(new Date(exCurrentDate.setSeconds(exCurrentDate.getSeconds()+(exItemQu * obj.EX_BASE_MIN) * 60)));
					}

					let add60Seconds = new Date(exCurrentDate);
					let __exCurrentDate = new Date(add60Seconds.setSeconds(add60Seconds.getSeconds()+60));
					let exCurrent_date = __exCurrentDate.getFullYear()+'-'+((__exCurrentDate.getMonth()+1) < 10 ? '0'+(__exCurrentDate.getMonth()+1):(__exCurrentDate.getMonth()+1))+'-'+(__exCurrentDate.getDate() < 10 ?'0'+__exCurrentDate.getDate():__exCurrentDate.getDate());
					let exCurrent_time = __exCurrentDate.getHours()+':'+__exCurrentDate.getMinutes()+':'+__exCurrentDate.getSeconds();
					// get week flag
					let _getWeekFlg = await GET_WEEK_FLG(exCurrent_date+' '+exCurrent_time);

					// let hrFlg = new Date(exCurrentDate);
					let currentDateHrFlg = new Date(exCurrentDate);
					currentDateHrFlg = new Date(currentDateHrFlg.setSeconds(currentDateHrFlg.getSeconds()+60));
					let currentDateHrFlg_date = currentDateHrFlg.getFullYear()+'-'+((currentDateHrFlg.getMonth()+1) < 10 ? '0'+(currentDateHrFlg.getMonth()+1):(currentDateHrFlg.getMonth()+1))+'-'+(currentDateHrFlg.getDate() < 10 ?'0'+currentDateHrFlg.getDate():currentDateHrFlg.getDate());
					let currentDateHrFlg_time = currentDateHrFlg.getHours()+':'+currentDateHrFlg.getMinutes()+':'+currentDateHrFlg.getSeconds();
					let hrFlg = new Date(currentDateHrFlg_date+' '+currentDateHrFlg_time).getHours();
					//Get Max SEQ base
					exItemMin = await GET_MAX_SEQ_MINS(obj.EX_ITEM_ID,obj.EX_BASE_MIN,exCurrentDate,endDate);
					exItemMin = (exItemMin < 0) ? 0 : exItemMin;

					if(exItemMin > 0) {
						exItemQu = 0;
						exItemPrice = 0;

						//Compute Item Quantity
						exItemQu = exItemMin / obj.EX_BASE_MIN;

						//Round Off Quantity
						exItemQu = ((exItemMin % obj.EX_BASE_MIN) > 0) ? Math.floor(exItemQu) + 1 :Math.floor(exItemQu);

						//Get Price Pack
						exItemPrice = await GET_EX_PRICE(obj.EX_ITEM_ID,_getWeekFlg,hrFlg,member_flg);

						//Fix Extension Name
						let exItemNameFix = (getSEQ == 0)?obj.EX_ITEM_NM:obj.EX_ITEM_NM+'('+getSEQ+')';

						uriageDtlToToken.push({
							'SALES_NO':uriage.SALES_NO,
							'SEQ':itemSequence,
							'SEAT_NO':uriage.SEAT_NO,
							'ITEM_SEQ':getSEQ,
							'ITEM_ID':obj.EX_ITEM_ID,
							'ITEM_NM':exItemNameFix,
							'ITEM_KBN':1,
							'TAX_KBN':MST_SHOP.TAX_FLG,
							'BASE_MIN':obj.EX_BASE_MIN,
							'ITEM_QU':exItemQu,

							'ITEM_PRICE':exItemPrice,
							'TOTAL_YEN':(exItemPrice * exItemQu),
							'SEAT_USE_START_DATE':exCurrentDate
							// then add
						});
						itemSequence++;

					}
					index++;
				} while(exCurrentDate < endDate);
				return uriageDtlToToken;
			}
		} catch(err) {
			sendError(0,'ExCurrentDate: '+err);
		}
	}

	async function GET_EX_PRICE(exItemId,weekFlg,hrFlg,uriageMemberFlg) {

		let SEQ = 0;
		let price = 0;
		hrFlg = (hrFlg < 10)?'0'+hrFlg:hrFlg;
		try {
			let query = await pool.request()
			.input('ITEM_ID', sql.VarChar, exItemId)
			.query("SELECT * FROM MST_EX_PLAN P WHERE P.ITEM_ID = @ITEM_ID AND P.WEEK_FLG = 10");
			if(query.recordset.length > 0) {
				for(let i in query.recordset) {
			let obj = query.recordset[i];
			SEQ = obj['WEEK_'+hrFlg];
					SEQ = (SEQ == 99)?0:SEQ;
					getSEQ = SEQ;
				}
			}

			if(SEQ == 0) {
				let query2 = await pool.request()
				.input('ITEM_ID', sql.VarChar, exItemId)
				.input('WEEK_FLG', sql.VarChar, weekFlg)
				.query("SELECT * FROM MST_EX_PLAN P WHERE P.ITEM_ID = @ITEM_ID AND P.WEEK_FLG = @WEEK_FLG");
				if(query2.recordset.length > 0) {
					for(let i in query2.recordset) {
				let obj = query2.recordset[i];
				SEQ = obj['WEEK_'+hrFlg];
				SEQ = (SEQ == 99)?0:SEQ;
				getSEQ = SEQ;
					}
				}
			}

			//Get Price
			let price_query = await pool.request()
			.input('ITEM_ID', sql.VarChar, exItemId)
			.input('SEQ', sql.Int, SEQ)
			.query("SELECT * FROM MST_EX_SEAT_ITEM WHERE ITEM_ID = @ITEM_ID  AND  SEQ = @SEQ");

			if(price_query.recordset.length > 0) {
				price = (uriageMemberFlg == 1) ? price_query.recordset[0].MEMBER_PRICE : price_query.recordset[0].VISITOR_PRICE ;
			}

		} catch(err) {
			sendError(0,'GET_EX_PRICE: '+err);
		}
		return price;
	}

	async function GET_MAX_SEQ_MINS(exItemId,exBaseMin,exCurrentDate,dateNow) {
		let maxMin = 0;
		try{
			let startDate = new Date(exCurrentDate);
			startDate = getDateTimeToString(new Date(startDate.setSeconds(startDate.getSeconds()+60)));
			let maxDate = new Date(exCurrentDate);
			let currSeq = await GET_EX_SEQ(exItemId,await GET_WEEK_FLG(startDate),new Date(startDate).getHours());

			do {
				if(getDateTimeToString(maxDate) < dateNow) {
					if(currSeq != await GET_EX_SEQ(exItemId,await GET_WEEK_FLG(startDate),new Date(startDate).getHours())) {
						break;
					} else {
						maxDate = new Date(maxDate.setSeconds(maxDate.getSeconds()+(exBaseMin * 60)));
						startDate = getDateTimeToString(new Date(maxDate.setSeconds(maxDate.getSeconds())));
					}
				} else {
					maxDate = dateNow;
					break;
				}

			} while(currSeq == await GET_EX_SEQ(exItemId,await GET_WEEK_FLG(startDate),new Date(startDate).getHours()));
			maxMin = Math.floor((new Date(maxDate) - new Date(exCurrentDate)) / 60000);
		} catch(err) {
		}
		return maxMin;
	}

	async function GET_EX_SEQ(exItemId,weekFlg,hour) {
		let SEQ = 0;
		hour = (hour < 10)?'0'+hour:hour;
		try {
			let query = await pool.request()
			.input('ITEM_ID', sql.VarChar, exItemId)
			.query("SELECT * FROM MST_EX_PLAN P WHERE P.ITEM_ID = @ITEM_ID AND P.WEEK_FLG = 10");
			if(query.recordset.length > 0) {
				for(let i in query.recordset) {
					let obj = query.recordset[i];
					SEQ = obj['WEEK_'+hour];
					SEQ = (SEQ == 99)?0:SEQ;
				}
			}

			if(SEQ == 0) {
				let query2 = await pool.request()
				.input('ITEM_ID', sql.VarChar, exItemId)
				.input('WEEK_FLG', sql.VarChar, weekFlg)
				.query("SELECT * FROM MST_EX_PLAN P WHERE P.ITEM_ID = @ITEM_ID AND P.WEEK_FLG = @WEEK_FLG");
				if(query2.recordset.length > 0) {
					for(let i in query2.recordset) {
						let obj = query2.recordset[i];
						SEQ = obj['WEEK_'+hour];
						SEQ = (SEQ == 99)?0:SEQ;
					}
				}
			}

		} catch(err) {
			sendError(0,'GET_EX_SEQ: '+err);
		}
		return SEQ;
	}

	async function GET_WEEK_FLG(data) {
		try {
			let split_datetime = data.split(' ');
			let weekflag = 0;

			let query = await pool.request()
			.input('holiday_date', sql.VarChar, split_datetime[0])
			.query("SELECT * FROM MST_HOLIDAY WHERE HOLIDAY_DATE = @holiday_date");

			if(query.recordset.length > 0) {
				for(let i in query.recordset) {
					let obj = query.recordset[i];
					switch(obj.HOLIDAY_KBN) {
						case 0:
							weekflag = 0;
							break;
						case 1:
							weekflag = 9;
							break;				
						case 2:
							weekflag = 9;
							break;
						case 9:
							weekflag = 8;
							break;
					}
				}
			} else {
				switch(new Date(data).getDay()) {
					case 0:
						weekflag = 1;
						break;
					case 1:
						weekflag = 2;
						break;
					case 2:
						weekflag = 3;
						break;
					case 3:
						weekflag = 4;
						break;
					case 4:
						weekflag = 5;
						break;
					case 5:
						weekflag = 6;
						break;
					case 6:
						weekflag = 7;
						break;
					case 8: //Before Holiday
						weekflag = 8;
						break;
					case 9: //Consecutive Holiday
						weekflag = 9;
						break; 
					case 10: //Not Fix
						weekflag = 10;
						break;
				}
			}
			return weekflag;
		} catch(err) {
			sendError(0,'GET_WEEK_FLG: '+err);
		}
	}

	// check for EXT, AUTOPACK
	async function GET_EXT_AUTOPACK_HT(data,uriage) {
		let _data = data;
		let _ExCurrentDate;
		let _tbl_uriage_class = {};
		let SEQ = 0;
		try	{
			let item = [];
			for(let i in _data) {
				let obj = _data[i];

				if(obj.ITEM_KBN > 1) {
					SEQ = (obj.SEQ == null)?SEQ:obj.SEQ;
					TBL_URIAGE_DTL_CLASS.push({
						BASE_MIN:obj.BASE_MIN,
						DELETE_FLG:obj.DELETE_FLG,
						FOOD_KBN:obj.FOOD_KBN,
						// INPUT_DATE:(obj.INPUT_DATE == null)?null:convert_datetime(obj.INPUT_DATE),
						INPUT_STAFF_ID:obj.INPUT_STAFF_ID,
						ITEM_ID:obj.ITEM_ID,
						ITEM_KBN:obj.ITEM_KBN,
						ITEM_NM:obj.ITEM_NM,
						ITEM_PRICE:obj.ITEM_PRICE,
						ITEM_QU:obj.ITEM_QU,
						ITEM_SEQ:obj.ITEM_SEQ,
						MAEBARAI_FLG:obj.MAEBARAI_FLG,
						RETURN_QU:0,
						SALES_NO:obj.SALES_NO,
						SEAT_NO:obj.SEAT_NO,
						SEAT_USE_START_DATE:(obj.SEAT_USE_START_DATE == null)?null:convert_datetime(obj.SEAT_USE_START_DATE),
						// SEISAN_DATE:null,
						// SEISAN_FLG:obj.SEISAN_FLG,
						SEQ:SEQ,
						TAX_KBN:obj.TAX_KBN,
						TOTAL_YEN:obj.TOTAL_YEN,
						// UPDATE_DATE:obj.UPDATE_DATE,
						UPDATE_STAFF_ID:CNST_STAFF_ID
					});
					total_price += parseInt(obj.TOTAL_YEN);
					SEQ++;
				} else {

					let query = await pool.request()
					.input('salesno', sql.Int, obj.SALES_NO)
					.input('itemid', sql.VarChar, obj.ITEM_ID)
					.query("SELECT D.SEAT_USE_START_DATE, D.ITEM_ID, D.ITEM_NM, S.CHANGE_PRICE_FLG, S.BASE_MIN AS SEAT_BASE_MIN, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN, CONVERT(varChar,S.PACK_END_TIME) AS PACK_END_TIME, AUTO_PACK_ID, D.ITEM_SEQ FROM TBL_URIAGE_DTL D INNER JOIN MST_SEAT_ITEM S ON D.ITEM_ID = S.ITEM_ID INNER JOIN MST_EX_SEAT_ITEM E ON S.EX_ITEM_ID = E.ITEM_ID WHERE S.SEQ = 0 AND E.SEQ = 0 AND D.SALES_NO = @salesno AND D.ITEM_ID = @itemid AND D.DELETE_FLG = '0';");

					for(let i2 in query.recordset) {
						let obj2 = query.recordset[i2];
						if(obj2.AUTO_PACK_ID != null) {
							let autoPack = await AUTO_PACK(obj2.ITEM_ID,obj2.SEAT_USE_START_DATE,SEISAN_DATE,_uriage.MEMBER_FLG,obj2.ITEM_SEQ);
								TBL_URIAGE_DTL_CLASS.push({
									BASE_MIN:autoPack.BASE_MIN,
									DELETE_FLG:obj.DELETE_FLG,
									FOOD_KBN:null,
									// INPUT_DATE:(obj.INPUT_DATE == null)?null:convert_datetime(obj.INPUT_DATE),
									INPUT_STAFF_ID:obj.INPUT_STAFF_ID,
									ITEM_ID:autoPack.ITEM_ID,
									ITEM_KBN:obj.ITEM_KBN,
									ITEM_NM:autoPack.ITEM_NM,
									ITEM_PRICE:autoPack.ITEM_PRICE,
									ITEM_QU:1,
									ITEM_SEQ:autoPack.ITEM_SEQ,
									MAEBARAI_FLG:obj.MAEBARAI_FLG,
									RETURN_QU:0,
									SALES_NO:obj.SALES_NO,
									SEAT_NO:obj.SEAT_NO,
									SEAT_USE_START_DATE:(obj.SEAT_USE_START_DATE == null)?null:convert_datetime(obj.SEAT_USE_START_DATE),
									// SEISAN_DATE:null,
									// SEISAN_FLG:obj.SEISAN_FLG,
									SEQ:SEQ,
									TAX_KBN:obj.TAX_KBN,
									TOTAL_YEN:autoPack.TOTAL_YEN,
									// UPDATE_DATE:obj.UPDATE_DATE,
									UPDATE_STAFF_ID:CNST_STAFF_ID
								});
								total_price += parseInt(obj.TOTAL_YEN);
								SEQ++;
								
								obj2.ITEM_ID = autoPack.ITEM_ID;
								obj2.ITEM_NM = autoPack.ITEM_NM;
								obj2.SEAT_BASE_MIN = autoPack.BASE_MIN;
								obj2.EX_ITEM_ID = autoPack.EX_ITEM_ID;
								obj2.EX_ITEM_NM = autoPack.EX_ITEM_NM;
								obj2.EX_BASE_MIN = autoPack.EX_BASE_MIN;
								obj2.PACK_END_TIME = autoPack.PACK_END_TIME;
								obj2.ITEM_SEQ = autoPack.ITEM_SEQ;
						} else {
							TBL_URIAGE_DTL_CLASS.push({
								BASE_MIN:obj2.EX_BASE_MIN,
								DELETE_FLG:obj.DELETE_FLG,
								FOOD_KBN:null,
								// INPUT_DATE:(obj.INPUT_DATE == null)?null:convert_datetime(obj.INPUT_DATE),
								INPUT_STAFF_ID:obj.INPUT_STAFF_ID,
								ITEM_ID:obj2.ITEM_ID,
								ITEM_KBN:obj.ITEM_KBN,
								ITEM_NM:obj2.ITEM_NM,
								ITEM_PRICE:obj.ITEM_PRICE,
								ITEM_QU:1,
								ITEM_SEQ:obj.ITEM_SEQ,
								MAEBARAI_FLG:obj.MAEBARAI_FLG,
								RETURN_QU:0,
								SALES_NO:obj.SALES_NO,
								SEAT_NO:obj.SEAT_NO,
								SEAT_USE_START_DATE:(obj.SEAT_USE_START_DATE == null)?null:convert_datetime(obj.SEAT_USE_START_DATE),
								// SEISAN_DATE:null,
								// SEISAN_FLG:obj.SEISAN_FLG,
								SEQ:SEQ,
								TAX_KBN:obj.TAX_KBN,
								TOTAL_YEN:obj.ITEM_PRICE,
								// UPDATE_DATE:obj.UPDATE_DATE,
								UPDATE_STAFF_ID:CNST_STAFF_ID
							});
							total_price += parseInt(obj.TOTAL_YEN);
							SEQ++;
						}

						let _GET_SEAT_ITEM_END_DATE = await GET_SEAT_ITEM_END_DATE([obj2]);
						_ExCurrentDate = await ExCurrentDate([obj2],_GET_SEAT_ITEM_END_DATE,obj,uriage);
						for(let ex in _ExCurrentDate) {
							let exobj = _ExCurrentDate[ex];

							TBL_URIAGE_DTL_CLASS.push({
								BASE_MIN:exobj.BASE_MIN,
								DELETE_FLG:obj.DELETE_FLG,
								FOOD_KBN:null,
								// INPUT_DATE:(obj.INPUT_DATE == null)?null:convert_datetime(obj.INPUT_DATE),
								INPUT_STAFF_ID:obj.INPUT_STAFF_ID,
								ITEM_ID:exobj.ITEM_ID,
								ITEM_KBN:exobj.ITEM_KBN,
								ITEM_NM:exobj.ITEM_NM,
								ITEM_PRICE:exobj.ITEM_PRICE,
								ITEM_QU:exobj.ITEM_QU,
								ITEM_SEQ:exobj.ITEM_SEQ,
								MAEBARAI_FLG:obj.MAEBARAI_FLG,
								RETURN_QU:0,
								SALES_NO:exobj.SALES_NO,
								SEAT_NO:obj.SEAT_NO,
								SEAT_USE_START_DATE:(obj.SEAT_USE_START_DATE == null)?null:convert_datetime(obj.SEAT_USE_START_DATE),
								// SEISAN_DATE:null,
								// SEISAN_FLG:obj.SEISAN_FLG,
								SEQ:SEQ,
								TAX_KBN:obj.TAX_KBN,
								TOTAL_YEN:exobj.TOTAL_YEN,
								// UPDATE_DATE:obj.UPDATE_DATE,
								UPDATE_STAFF_ID:CNST_STAFF_ID
							});
							total_price += parseInt(exobj.TOTAL_YEN);
							SEQ++;
						}
					}
				
				}

			}

		} catch(err) {
			sendError(CNST_ERROR_CODE.error_11,'GET_EXT_AUTOPACK_HT\n'+err);
		}
		return TBL_URIAGE_DTL_CLASS;
	}

	async function MERGE_URIAGE_DTL(obj,_hash) {
		let table = new sql.Table('TBL_URIAGE_DTL_TEMP');
		let SEQ = 0;
		table.create = true;
		table.columns.add('TOKEN_ID', sql.VarChar, {nullable:true});
		table.columns.add('SALES_NO', sql.VarChar, {nullable:true});
		table.columns.add('SEQ', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_SEQ', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_ID', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_KBN', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_NM', sql.NVarChar(120), {nullable:true});
		table.columns.add('FOOD_KBN', sql.VarChar, {nullable:true});
		table.columns.add('TAX_KBN', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_QU', sql.VarChar, {nullable:true});
		table.columns.add('ITEM_PRICE', sql.VarChar, {nullable:true});
		table.columns.add('BASE_MIN', sql.VarChar, {nullable:true});
		table.columns.add('TOTAL_YEN', sql.VarChar, {nullable:true});
		table.columns.add('SEISAN_DATE', sql.VarChar, {nullable:true});
		table.columns.add('SEISAN_FLG', sql.VarChar, {nullable:true});
		table.columns.add('MAEBARAI_FLG', sql.VarChar, {nullable:true});
		table.columns.add('DELETE_FLG', sql.VarChar, {nullable:true});
		table.columns.add('RETURN_QU', sql.VarChar, {nullable:true});
		table.columns.add('SEAT_USE_START_DATE', sql.VarChar, {nullable:true});
		table.columns.add('SEAT_NO', sql.VarChar, {nullable:true});
		table.columns.add('INPUT_STAFF_ID', sql.VarChar, {nullable:true});
		table.columns.add('INPUT_DATE', sql.VarChar, {nullable:true});
		table.columns.add('UPDATE_STAFF_ID', sql.VarChar, {nullable:true});
		table.columns.add('UPDATE_DATE', sql.VarChar, {nullable:true});
		
		for(let i in obj) {
			let _obj = obj[i];
			table.rows.add(
				_hash,
				_obj.SALES_NO,
				SEQ,
				_obj.ITEM_SEQ,
				_obj.ITEM_ID,
				_obj.ITEM_KBN,
				_obj.ITEM_NM,
				_obj.FOOD_KBN,
				_obj.TAX_KBN,
				_obj.ITEM_QU,
				_obj.ITEM_PRICE,
				_obj.BASE_MIN,
				_obj.TOTAL_YEN,
				null,
				_obj.SEISAN_FLG,
				_obj.MAEBARAI_FLG,
				_obj.DELETE_FLG,
				_obj.RETURN_QU,
				(_obj.SEAT_USE_START_DATE == null)?null:_obj.SEAT_USE_START_DATE,
				_obj.SEAT_NO,
				_obj.INPUT_STAFF_ID,
				_obj.INPUT_DATE,
				_obj.UPDATE_STAFF_ID,
				(_obj.UPDATE_DATE == null)?null:convert_datetime(_obj.UPDATE_DATE)
			);
			SEQ++;
		}
		let request = new sql.Request()
		request.bulk(table, (err, result) => {
			if(err) res.json(0);
			console.log(result);
		});
		let TEMP_URIAGE_DTL2 = await pool.request()
		.input('TOKEN_ID', sql.VarChar, _hash)
		.query("SELECT DISTINCT ITEM_ID, ITEM_KBN, ITEM_NM, ITEM_PRICE, SUM(ITEM_QU) AS ITEM_QU, SUM(TOTAL_YEN) AS TOTAL_YEN, TOKEN_ID, SALES_NO, SEQ, ITEM_SEQ, [FOOD_KBN], [TAX_KBN], [ITEM_QU], [BASE_MIN], [TOTAL_YEN], [SEISAN_DATE], [SEISAN_FLG], [MAEBARAI_FLG], [DELETE_FLG], [RETURN_QU], [SEAT_USE_START_DATE], [SEAT_NO], [INPUT_STAFF_ID], [INPUT_DATE], [UPDATE_STAFF_ID], [UPDATE_DATE] FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID GROUP BY ITEM_ID, ITEM_KBN, ITEM_NM, ITEM_PRICE, TOKEN_ID, SALES_NO, BASE_MIN, SEQ, ITEM_SEQ, [FOOD_KBN], [TAX_KBN], [ITEM_QU], [BASE_MIN], [TOTAL_YEN], [SEISAN_DATE], [SEISAN_FLG], [MAEBARAI_FLG], [DELETE_FLG], [RETURN_QU], [SEAT_USE_START_DATE], [SEAT_NO], [INPUT_STAFF_ID], [INPUT_DATE], [UPDATE_STAFF_ID], [UPDATE_DATE];");
		return TEMP_URIAGE_DTL2;
	}

	async function DELETE_TEMP_URIAGE_DTL(_hash) {
		let DELETE_TMP_URIAGE_DTL = await pool.request()
		.input('TOKEN_ID', sql.NVarChar(50), _hash)
		.query("DELETE FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID");
		return DELETE_TMP_URIAGE_DTL;
	}

	async function ADD_NEW_TEMP_URIAGE_DTL(obj,_hash) {
		console.log(obj);
		try {

			let table = new sql.Table('TBL_URIAGE_DTL_TEMP');
			table.create = true;
			table.columns.add('TOKEN_ID', sql.VarChar, {nullable:true});
			table.columns.add('SALES_NO', sql.VarChar, {nullable:true});
			table.columns.add('SEQ', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_SEQ', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_ID', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_KBN', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_NM', sql.NVarChar(120), {nullable:true});
			table.columns.add('FOOD_KBN', sql.VarChar, {nullable:true});
			table.columns.add('TAX_KBN', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_QU', sql.VarChar, {nullable:true});
			table.columns.add('ITEM_PRICE', sql.VarChar, {nullable:true});
			table.columns.add('BASE_MIN', sql.VarChar, {nullable:true});
			table.columns.add('TOTAL_YEN', sql.VarChar, {nullable:true});
			table.columns.add('SEISAN_DATE', sql.VarChar, {nullable:true});
			table.columns.add('SEISAN_FLG', sql.VarChar, {nullable:true});
			table.columns.add('MAEBARAI_FLG', sql.VarChar, {nullable:true});
			table.columns.add('DELETE_FLG', sql.VarChar, {nullable:true});
			table.columns.add('RETURN_QU', sql.VarChar, {nullable:true});
			table.columns.add('SEAT_USE_START_DATE', sql.VarChar, {nullable:true});
			table.columns.add('SEAT_NO', sql.VarChar, {nullable:true});
			table.columns.add('INPUT_STAFF_ID', sql.VarChar, {nullable:true});
			table.columns.add('INPUT_DATE', sql.VarChar, {nullable:true});
			table.columns.add('UPDATE_STAFF_ID', sql.VarChar, {nullable:true});
			table.columns.add('UPDATE_DATE', sql.VarChar, {nullable:true});
			for(let i in obj.recordset) {
				let _obj = obj.recordset[i];
				console.log(_obj);
				table.rows.add(
					_hash,
					_obj.SALES_NO,
					_obj.SEQ,
					_obj.ITEM_SEQ,
					_obj.ITEM_ID,
					_obj.ITEM_KBN,
					_obj.ITEM_NM,
					_obj.FOOD_KBN,
					_obj.TAX_KBN,
					_obj.ITEM_QU[0],
					_obj.ITEM_PRICE,
					_obj.BASE_MIN,
					_obj.TOTAL_YEN[0],
					null,
					_obj.SEISAN_FLG,
					_obj.MAEBARAI_FLG,
					_obj.DELETE_FLG,
					_obj.RETURN_QU,
					(_obj.SEAT_USE_START_DATE == null)?null:convert_datetime(_obj.SEAT_USE_START_DATE),
					_obj.SEAT_NO,
					_obj.INPUT_STAFF_ID,
					convert_datetime(_obj.INPUT_DATE),
					_obj.UPDATE_STAFF_ID,
					(_obj.UPDATE_DATE == null)?null:convert_datetime(_obj.UPDATE_DATE)
				);
			}
			let request = new sql.Request()
			request.bulk(table, async (err, result) => {
				if(err) res.json(0);
				console.log(result);
			});
			let TEMP_URIAGE_DTL = await pool.request()
			.input('TOKEN_ID', sql.NVarChar(50), _hash)
			.query("SELECT DISTINCT ITEM_ID, ITEM_KBN, ITEM_NM, ITEM_PRICE, SUM(ITEM_QU) AS ITEM_QU, SUM(TOTAL_YEN) AS TOTAL_YEN, TOKEN_ID, SALES_NO, SEQ, ITEM_SEQ, [FOOD_KBN], [TAX_KBN], [ITEM_QU], [BASE_MIN], [TOTAL_YEN], [SEISAN_DATE], [SEISAN_FLG], [MAEBARAI_FLG], [DELETE_FLG], [RETURN_QU], [SEAT_USE_START_DATE], [SEAT_NO], [INPUT_STAFF_ID], [INPUT_DATE], [UPDATE_STAFF_ID], [UPDATE_DATE] FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID GROUP BY ITEM_ID, ITEM_KBN, ITEM_NM, ITEM_PRICE, TOKEN_ID, SALES_NO, BASE_MIN, SEQ, ITEM_SEQ, [FOOD_KBN], [TAX_KBN], [ITEM_QU], [BASE_MIN], [TOTAL_YEN], [SEISAN_DATE], [SEISAN_FLG], [MAEBARAI_FLG], [DELETE_FLG], [RETURN_QU], [SEAT_USE_START_DATE], [SEAT_NO], [INPUT_STAFF_ID], [INPUT_DATE], [UPDATE_STAFF_ID], [UPDATE_DATE];");
			return TEMP_URIAGE_DTL;
		} catch(err) {
			sendError(0,'ADD_NEW_TEMP_URIAGE_DTL: '+err);
		}
	}

	async function GET_NEW_TEMP_URIAGE_DTL(_hash,SALES_NO) {
		try {
			let _GET_TMP_URIAGE_DTL = await pool.request()
			.input('TOKEN_ID', sql.NVarChar(50), _hash)
			.input('SALES_NO', sql.NVarChar(50), SALES_NO)
			.query("SELECT * FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID AND SALES_NO = @SALES_NO");
			if(_GET_TMP_URIAGE_DTL.recordset.length > 0) {
				return _GET_TMP_URIAGE_DTL.recordset;
			} else {
				let _GET_TMP_URIAGE_DTL2 = await pool.request()
				.input('TOKEN_ID', sql.NVarChar(50), _hash)
				.input('SALES_NO', sql.NVarChar(50), SALES_NO)
				.query("SELECT * FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID AND SALES_NO = @SALES_NO");
				return _GET_TMP_URIAGE_DTL2.recordset;
			}
		} catch (err) {
			sendError(0,'GET_NEW_TEMP_URIAGE_DTL: '+err);
		}
	}

	async function INSERT_TOKENIZED_URIAGE_DTL(obj) {
		try{

			let _hash = await hashCode(dateTimeNow());

			let table = new sql.Table('TBL_URIAGE_DTL_TEMP');
			table.columns.add('TOKEN_ID', sql.NVarChar(50), {nullable: true});
			table.columns.add('SALES_NO', sql.NVarChar(50), {nullable: true});
			table.columns.add('ITEM_ID', sql.NVarChar(50), {nullable: true});
			table.columns.add('ITEM_KBN', sql.Int, {nullable: true});
			table.columns.add('ITEM_NM', sql.NVarChar(50), {nullable: true});
			table.columns.add('PRICE', sql.Int, {nullable: true});
			table.columns.add('QU', sql.Int, {nullable: true});
			table.columns.add('TOTAL', sql.Int, {nullable: true});
			for(let i in obj) {
				let _obj = obj[i];
				table.rows.add(_hash,_obj.SALES_NO,_obj.ITEM_ID,_obj.ITEM_KBN,_obj.ITEM_NM,_obj.PRICE,_obj.QU,_obj.TOTAL);
			}
			
			let request = new sql.Request()
			request.bulk(table, async (err, result) => {
				if(err) res.json(0);
			});
			let TEMP_URIAGE_DTL = await pool.request()
			.input('TOKEN_ID', sql.NVarChar(50), _hash)
			.query("SELECT DISTINCT ITEM_ID, ITEM_KBN, ITEM_NM, PRICE, SUM(QU) AS QU, SUM(TOTAL) AS TOTAL, TOKEN_ID, SALES_NO FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID GROUP BY ITEM_ID, ITEM_KBN, ITEM_NM, PRICE, TOKEN_ID, SALES_NO;");
			let DELETE_TMP_URIAGE_DTL = await pool.request()
			.input('TOKEN_ID', sql.NVarChar(50), _hash)
			.query("DELETE FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID");

			let table2 = new sql.Table('TBL_URIAGE_DTL_TEMP');
			table2.columns.add('TOKEN_ID', sql.NVarChar(50), {nullable: true});
			table2.columns.add('SALES_NO', sql.NVarChar(50), {nullable: true});
			table2.columns.add('ITEM_ID', sql.NVarChar(50), {nullable: true});
			table2.columns.add('ITEM_KBN', sql.Int, {nullable: true});
			table2.columns.add('ITEM_NM', sql.NVarChar(50), {nullable: true});
			table2.columns.add('PRICE', sql.Int, {nullable: true});
			table2.columns.add('QU', sql.Int, {nullable: true});
			table2.columns.add('TOTAL', sql.Int, {nullable: true});
			for(let i in TEMP_URIAGE_DTL.recordset) {
				let _obj = TEMP_URIAGE_DTL.recordset[i];
				table2.rows.add(_hash,_obj.SALES_NO,_obj.ITEM_ID,_obj.ITEM_KBN,_obj.ITEM_NM,_obj.PRICE,_obj.QU,_obj.TOTAL);
			}
			let request2 = new sql.Request()
			let last_return = request2.bulk(table2, async (err2, result2) => {
				if(err2) res.json(0);
			});
			let _GET_TMP_URIAGE_DTL = await pool.request()
			.input('TOKEN_ID', sql.NVarChar(50), _hash)
			.query("SELECT * FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID;");
			return _GET_TMP_URIAGE_DTL.recordset;
		} catch(err) {
			sendError(0,'INSERT_TOKENIZED_URIAGE_DTL: '+err);
		}
		
	}

	async function GET_TMP_URIAGE_DTL(hashCode) {
		let _GET_TMP_URIAGE_DTL = await pool.request()
		.input('TOKEN_ID', sql.NVarChar(50), hashCode)
		.query("SELECT * FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID;");
		return _GET_TMP_URIAGE_DTL.recordset;
	}

	async function hashCode(s) {
		var a = 1, c = 0, h, o;
		if (s) {
			a = 0;
			for (h = s.length - 1; h >= 0; h--) {
				o = s.charCodeAt(h);
				a = (a<<6&268435455) + o + (o<<14);
				c = a & 266338304;
				a = c!==0?a^c>>21:a;
			}
		}
		return String(a);
	}

	async function AUTO_PACK(itemId,seatUseStartDate,seatUseEndDate,uriageMemberFlg,itemSeq,useCount = 1) {

		let SQL = '';
		let itemName = '';
		let itemBaseMin = '';
		let exItemId = '';
		let exItemNm = '';

		let itemPrice = 0;
		let ExBaseMin = 0;
		let PackEndTime = '';
		let AutoPackId = '';

		let totalYen = 0;
		let minPrice = 0;

		let autoPackIndex = 0;

		let useMin = await CALC_TOTAL_MINS(seatUseStartDate,seatUseEndDate);
		let weekFlg = await GET_WEEK_FLG(convert_datetime(seatUseStartDate));

		try {

			SQL = "SELECT TOP 1 I.ITEM_ID, I.ITEM_NM, I.BASE_MIN AS SEAT_BASE_MIN, CASE WHEN P.MEMBER_PRICE IS NULL THEN I.MEMBER_PRICE ELSE P.MEMBER_PRICE END AS MEMBER_PRICE, CASE WHEN P.VISITOR_PRICE IS NULL THEN I.VISITOR_PRICE ELSE P.VISITOR_PRICE END AS VISITOR_PRICE, I.PACK_END_TIME, I.AUTO_PACK_ID, I.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM I INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = I.EX_ITEM_ID LEFT JOIN (SELECT P.ITEM_ID, P.SEQ, P.MEMBER_PRICE, P.VISITOR_PRICE FROM MST_SEAT_ITEM P WHERE ( P.START_CHANGE_TIME <= @ENDDATE AND P.END_CHANGE_TIME > @ENDDATE ) AND WEEK_FLG = @WEEK_FLG) P ON I.ITEM_ID = P.ITEM_ID WHERE I.ITEM_ID = @ITEM_ID AND I.SEQ = @SEQ";

			let getEndDate = seatUseEndDate.split(' ')[1];
			let getHmm = getEndDate.split(':');

			let query = await pool.request()
			.input('SEQ', sql.VarChar, itemSeq)
			.input('ITEM_ID', sql.VarChar, itemId)
			.input('WEEK_FLG', sql.VarChar, weekFlg)
			.input('ENDDATE', sql.VarChar, getHmm[0]+':'+getHmm[1])
			.query(SQL);

			if(query.recordset.length > 0) {

				for(let i in query.recordset) {
					let obj = query.recordset[i];

					itemName = obj.ITEM_NM;
					itemBaseMin = obj.SEAT_BASE_MIN;
					exItemId = obj.EX_ITEM_ID;
					exItemNm = obj.EX_ITEM_NM;
					if(uriageMemberFlg == 1) {
						itemPrice = obj.MEMBER_PRICE;
					} else {
						itemPrice = obj.VISITOR_PRICE;
					}

					ExBaseMin = obj.EX_BASE_MIN;
					PackEndTime = obj.PACK_END_TIME;
					AutoPackId = obj.AUTO_PACK_ID;

				}

			}

			let data = [];
			data.push({
				SEAT_USE_START_DATE:seatUseStartDate,
				PACK_END_TIME:PackEndTime,
				AUTO_PACK_ID:AutoPackId,
				ITEM_SEQ:itemSeq,
				SEAT_BASE_MIN:itemBaseMin
			});

			let exCurrentDate = (PackEndTime == '')?getDateTimeToString(new Date(seatUseStartDate.setSeconds(seatUseStartDate.getSeconds()+60))):await GET_SEAT_ITEM_END_DATE(data);

			totalYen = itemPrice + (await CALC_EXPRICE_VIRTUAL(seatUseStartDate,seatUseEndDate,uriageMemberFlg,itemBaseMin,exItemId,ExBaseMin,PackEndTime,useCount));

			let SQL_PACK_A = "IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN ) BEGIN CREATE TABLE #TMP_SEAT_ITEM_10 ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_10 SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN CREATE TABLE #TMP_SEAT_ITEM_WEEK ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_WEEK SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN SELECT * FROM #TMP_SEAT_ITEM_WEEK A UNION SELECT * FROM #TMP_SEAT_ITEM_10 B WHERE B.ITEM_ID NOT IN (SELECT A.ITEM_ID FROM #TMP_SEAT_ITEM_WEEK A) ORDER BY ITEM_PRICE DROP TABLE #TMP_SEAT_ITEM_10 DROP TABLE #TMP_SEAT_ITEM_WEEK END ELSE IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ) SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) OR ( ISNULL(S.START_CHANGE_TIME, '') = '' AND ISNULL(s.END_CHANGE_TIME, '') = '' ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ELSE SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN";

			let SQL_PACK_B = "IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN DESC ) BEGIN CREATE TABLE #TMP_SEAT_ITEM_10 ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_10 SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN DESC CREATE TABLE #TMP_SEAT_ITEM_WEEK ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_WEEK SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN DESC SELECT * FROM #TMP_SEAT_ITEM_WEEK A UNION SELECT * FROM #TMP_SEAT_ITEM_10 B WHERE B.ITEM_ID NOT IN (SELECT A.ITEM_ID FROM #TMP_SEAT_ITEM_WEEK A) ORDER BY ITEM_PRICE DROP TABLE #TMP_SEAT_ITEM_10 DROP TABLE #TMP_SEAT_ITEM_WEEK END ELSE IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN DESC ) SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) OR ( ISNULL(S.START_CHANGE_TIME, '') = '' AND ISNULL(s.END_CHANGE_TIME, '') = '' ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN DESC ELSE SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN DESC";

			let query_SQL_PACK_A = await pool.request()
			.input('AUTO_PACK_ID', sql.VarChar, AutoPackId)
			.input('USEMIN', sql.VarChar, useMin)
			.input('ENDDATE', sql.VarChar, getHmm[0]+':'+getHmm[1])
			.input('WEEK_FLG', sql.VarChar,weekFlg)
			.input('MEMBER_FLG', sql.Int, uriageMemberFlg)
			.query(SQL_PACK_A);

			if(query_SQL_PACK_A.recordset.length > 0) {

				for(let i in query_SQL_PACK_A.recordset) {
					let obj = query_SQL_PACK_A.recordset[i];
					totalYen = obj.ITEM_PRICE;
					autoPackClass.push({
						ITEM_ID: obj.ITEM_ID,
						ITEM_NM: obj.ITEM_NM,
						ITEM_SEQ: obj.SEQ,
						ITEM_PRICE: totalYen,
						BASE_MIN: obj.BASE_MIN,
						EX_ITEM_ID: obj.EX_ITEM_ID,
						EX_ITEM_NM: obj.EX_ITEM_NM,
						EX_BASE_MIN: obj.EX_BASE_MIN,
						PACK_END_TIME: obj.PACK_END_TIME,
						TOTAL_YEN: totalYen
					});

				}

			}

			let query_SQL_PACK_B = await pool.request()
			.input('AUTO_PACK_ID', sql.VarChar, AutoPackId)
			.input('USEMIN', sql.VarChar, useMin)
			.input('ENDDATE', sql.VarChar, getHmm[0]+':'+getHmm[1])
			.input('WEEK_FLG', sql.VarChar,weekFlg)
			.input('MEMBER_FLG', sql.Int, uriageMemberFlg)
			.query(SQL_PACK_B);

			if(query_SQL_PACK_B.recordset.length > 0) {

				for(let i in query_SQL_PACK_B.recordset) {
					let obj = query_SQL_PACK_B.recordset[i];
					totalYen = obj.ITEM_PRICE;
					autoPackClass.push({
						ITEM_ID: obj.ITEM_ID,
						ITEM_NM: obj.ITEM_NM,
						ITEM_SEQ: obj.SEQ,
						ITEM_PRICE: totalYen,
						BASE_MIN: obj.BASE_MIN,
						EX_ITEM_ID: obj.EX_ITEM_ID,
						EX_ITEM_NM: obj.EX_ITEM_NM,
						EX_BASE_MIN: obj.EX_BASE_MIN,
						PACK_END_TIME: obj.PACK_END_TIME,
						TOTAL_YEN: totalYen
					});

				}

			}

			//Get Current Pack
			minPrice = autoPackClass[0].ITEM_PRICE;
			autoPackIndex = 0;

			//Get Lowest Price Pack
			for(let i = 0; i < autoPackClass.length; i++) {
				if(autoPackClass[i].TOTAL_YEN <= minPrice) {
					minPrice = autoPackClass[i].ITEM_PRICE;
					autoPackIndex = i;
				}
			}

		} catch(err) {
			sendError(0,'AUTO_PACK:\n'+err);
		}
		return autoPackClass[autoPackIndex];

	}

	async function CALC_EXPRICE_VIRTUAL(seatUseStartDate,seatUseEndDate,memberFlg,itemBaseMin,exItemId,exBaseMin,packEndTime,useCount) {

		let _seatUseStartDate = new Date(convert_datetime(seatUseStartDate));
		let index = 0;
		let exItemQu = 1;
		let weekFlg;
		let HR;
		let exItemMin;
		let exItemPrice;
		let exTotalYen = 0;

		try {

			let data = [];
	        data.push({
	        	SEAT_USE_START_DATE:seatUseStartDate,
	        	PACK_END_TIME:packEndTime,
	        	SEAT_BASE_MIN:itemBaseMin
	        });

			let exCurrentDate = (packEndTime == '')?getDateTimeToString(new Date(_seatUseStartDate.setSeconds(_seatUseStartDate.getSeconds()+(itemBaseMin*60)))):await GET_SEAT_ITEM_END_DATE(data);

			do {

				if(index == 0) {
					exCurrentDate = (packEndTime == '')?getDateTimeToString(new Date(_seatUseStartDate.setSeconds(_seatUseStartDate.getSeconds()+(itemBaseMin*60)))):await GET_SEAT_ITEM_END_DATE(data);
				} else {
					let exCurrentDateAdded60Secs = new Date(exCurrentDate);
					exCurrentDate = getDateTimeToString(new Date(exCurrentDateAdded60Secs.setSeconds(exCurrentDateAdded60Secs.getSeconds()+(exItemQu * exBaseMin * 60))))
				}

				//Get Week Flg
				let weekExCurrentDate = new Date(exCurrentDate);
				weekExCurrentDate.setSeconds(weekExCurrentDate.getSeconds()+60);
				weekFlg = await GET_WEEK_FLG(getDateTimeToString(weekExCurrentDate));

				//Get Hr Value
				let getHrExCurrentDate = new Date(exCurrentDate);
					getHrExCurrentDate = new Date(getHrExCurrentDate.setSeconds(getHrExCurrentDate.getSeconds()+60));
				HR = getHrExCurrentDate.getHours();

				//Get Max SEQ base
				exItemMin = await GET_MAX_SEQ_MINS(exItemId,exBaseMin,exCurrentDate,seatUseEndDate);
				exItemMin = (exItemMin < 0)?0:exItemMin;

				if(exItemMin > 0) {
					exItemQu = 0;
					exItemPrice = 0;

					//Compute Item Quantity
					exItemQu = Math.floor(exItemMin / exBaseMin);

					//Round Off Quantity
					exItemQu = (exItemMin % exBaseMin > 0)?exItemQu + 1:exItemQu;

					exItemQu = (exItemQu * useCount);

					//Get Price Pack
					// let currSeq = await GET_EX_SEQ(exItemId,weekFlg,HR);

					exItemPrice = await GET_EX_PRICE(exItemId,weekFlg,HR,memberFlg);

					exTotalYen += (exItemPrice * exItemQu);
				}
				index += 1;
			} while (exCurrentDate < seatUseEndDate)

		} catch(err) {
			sendError(0,'CALC_EXPRICE_VIRTUAL: '+err);
		}
		return exTotalYen;
	}

	async function CALC_TOTAL_MINS(seatUseStartDate,seatUseEndDate) {

		let _seatUseStartDate = new Date(convert_datetime(seatUseStartDate));
		let _seatUseEndDate = new Date(seatUseEndDate);
		let totalMins = 0;
		let diffMins = 0;

		try {
			totalMins = Math.floor(_seatUseEndDate - _seatUseStartDate);
			// get minutes
			diffMins = Math.floor(totalMins / 60000);
		} catch(err) {
			sendError(0,'CALC_TOTAL_MINS: '+err);
		}
		return diffMins;
	}

	async function GET_SEAT_ITEM_END_DATE(data) {
		try	{
			for(let i in data) {
				let obj = data[i];
				let options = {hour:'2-digit',minute:'2-digit'};
				let itemEndDatePack = false;
				let itemEndDateBase = false;
				let SEAT_USE_START_DATE = obj.SEAT_USE_START_DATE;
				let PACK_END_TIME = obj.PACK_END_TIME;
				let dtItemEndDate = false;

				if(PACK_END_TIME !== null) {

					let seat_use_start_date = convert_datetime(SEAT_USE_START_DATE).split(' ');
					let seat_use_start_ymd = seat_use_start_date[0];
					let seat_use_start_time = seat_use_start_date[1];
					if(PACK_END_TIME <= seat_use_start_time) {
						let addDay_start_date = new Date(SEAT_USE_START_DATE.setDate(SEAT_USE_START_DATE.getDate()+1));
						itemEndDatePack = convert_datetime(addDay_start_date).split(' ')[0]+' '+PACK_END_TIME;
					} else if(PACK_END_TIME >= seat_use_start_time) {
						itemEndDatePack = convert_datetime(SEAT_USE_START_DATE).split(' ')[0]+' '+PACK_END_TIME;
					}
					// add minutes
					let new_SEAT_USE_START_DATE = new Date(convert_datetime(SEAT_USE_START_DATE));
					let addMinutesToStartDate = new Date(new_SEAT_USE_START_DATE.setMinutes(new_SEAT_USE_START_DATE.getMinutes()+obj.SEAT_BASE_MIN));
					let getDateToAddMin = addMinutesToStartDate.getFullYear()+'-'+((addMinutesToStartDate.getMonth()+1) < 10 ? '0'+(addMinutesToStartDate.getMonth()+1):(addMinutesToStartDate.getMonth()+1))+'-'+(addMinutesToStartDate.getDate() < 10 ?'0'+addMinutesToStartDate.getDate():addMinutesToStartDate.getDate());
					itemEndDateBase = getDateToAddMin+' '+addMinutesToStartDate.getHours()+':'+addMinutesToStartDate.getMinutes()+':'+addMinutesToStartDate.getSeconds();
					if(itemEndDateBase >= itemEndDatePack) {
						dtItemEndDate = itemEndDatePack;
					} else {
						dtItemEndDate = itemEndDateBase;
					}

				} else {
					let new_SEAT_USE_START_DATE = new Date(convert_datetime(SEAT_USE_START_DATE));
					let addMinutesToStartDate = new Date(new_SEAT_USE_START_DATE.setMinutes(new_SEAT_USE_START_DATE.getMinutes()+obj.SEAT_BASE_MIN));
					let getDateToAddMin = addMinutesToStartDate.getFullYear()+'-'+((addMinutesToStartDate.getMonth()+1) < 10 ? '0'+(addMinutesToStartDate.getMonth()+1):(addMinutesToStartDate.getMonth()+1))+'-'+(addMinutesToStartDate.getDate() < 10 ?'0'+addMinutesToStartDate.getDate():addMinutesToStartDate.getDate());
					dtItemEndDate = getDateToAddMin+' '+addMinutesToStartDate.getHours()+':'+addMinutesToStartDate.getMinutes()+':'+addMinutesToStartDate.getSeconds();
				}
				return dtItemEndDate;
			}
		} catch(err) {
			sendError(0,'GET_SEAT_ITEM_END_DATE: '+err);
		}
	}

	async function GET_EXTCURRENT(data) {
		try	{
			let item = [];
			for(let i in data) {
				let obj = data[i];
				let query = await pool.request()
				.input('salesno', sql.Int, obj.SALES_NO)
				.input('itemid', sql.VarChar, obj.ITEM_ID)
				.query("SELECT D.SEAT_USE_START_DATE, D.ITEM_ID, D.ITEM_NM, S.CHANGE_PRICE_FLG, S.BASE_MIN AS SEAT_BASE_MIN, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN, S.PACK_END_TIME, AUTO_PACK_ID FROM TBL_URIAGE_DTL D INNER JOIN MST_SEAT_ITEM S ON D.ITEM_ID = S.ITEM_ID INNER JOIN MST_EX_SEAT_ITEM E ON S.EX_ITEM_ID = E.ITEM_ID WHERE S.SEQ = 0 AND E.SEQ = 0 AND D.SALES_NO = @salesno AND D.ITEM_ID = @itemid AND D.DELETE_FLG = '0';");
				item.push(query.recordset);
			}
			return item;
		} catch(err) {
			sendError(0,'get tbl uriage: '+err);
		}
	}

	async function GET_ALL_TOTAL() {
		try{
			let query = await pool.request()
	        .input('seatno', sql.Int, seat_no)
	        .query("SELECT SUM([TBL_URIAGE].[URIAGE_YEN]) AS [ALL_TOTAL] FROM [POS-_-00141-_-4_04].[dbo].[TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
	        return query.recordset[0].ALL_TOTAL;
		} catch(err) {
			sendError(0,'get all total');
		}

	}

	async function GET_ALL_TAX(tax_rate) {
		try{
			let query = await pool.request()
	        .input('seatno', sql.Int, seat_no)
	        .query("SELECT SUM([TBL_URIAGE].[URIAGE_YEN]) AS [ALL_TOTAL] FROM [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
	        return return_json.ALL_TOTAL * (tax_rate / (100 + await TAX_RATE(_getDate)));
		} catch(err) {
			sendError(0,'get all tax');
		}
	}

	async function TAX_RATE(date) {
		try{
			let query = await pool.request()
			.query("SELECT TOP(1) CONVERT(char(10), [MST_TAX].[START_DATE],120) AS [START_DATE], [TAX_RATE] FROM [MST_TAX] ORDER BY [START_DATE] DESC;");
			let data = query.recordset[0];
			if(date <= data.START_DATE) {
				result = data.TAX_RATE;
			} else {
				result = 0;
			}
			return result;
		} catch(err) {
			console.log(err);
			sendError(CNST_ERROR_CODE.error_11,'tax rate');
		}
	}

	async function compute_TAX_YEN(price) {
		let result = 0;
		try{
		let query = await pool.request()
		.query("SELECT TOP(1) CONVERT(char(10), [MST_TAX].[START_DATE],120) AS [START_DATE], [TAX_RATE] FROM [MST_TAX] AS [MST_TAX] ORDER BY [START_DATE] DESC;");
		let data = query.recordset[0];
			if(_getDate <= data.START_DATE) {
				result = price / (100 + data.TAX_RATE) * (data.TAX_RATE);
			} else {
				result = price * (data.TAX_RATE / 100);
			}
			return Math.floor(result);
		} catch(err) {
			sendError(CNST_ERROR_CODE.error_11,'compute tax yen\n'+err);
		}
	}

    async function TBL_URIAGE_DTL(SALES_NO) {

    	try {
    		let result2 = await pool.request()
		    .input('salesno', sql.Int, SALES_NO)
		    .query("SELECT * FROM [TBL_URIAGE_DTL] AS [TBL_URIAGE_DTL] WHERE [TBL_URIAGE_DTL].[SALES_NO] = @salesno;");
		    return result2.recordset;
    	} catch(err) {
    		sendError(CNST_ERROR_CODE.error_11,'get tbl uriage dtl\n'+err);
    	}

		}
		
		async function SEAT_ITEM_USE_MIN(salesNo,seisanDate) {
			let min = 0;
			let SQL = '';
			let result = null;
	
			try{
	
				SQL = "SELECT OCCUPIED_TIME = DATEDIFF(MINUTE, LOGIN_DATE, @END_DATE) FROM TBL_SEAT_STATUS WHERE SALES_NO = @SALES_NO AND DELETE_FLG = @DELETE_FLG AND SEISAN_FLG = @SEISAN_FLG";
	
				result = await pool.request()
				.input('SALES_NO', sql.NVarChar, salesNo)
				.input('END_DATE', sql.NVarChar, seisanDate)
				.input('DELETE_FLG', sql.TinyInt, 0)
				.input('SEISAN_FLG', sql.TinyInt, 0)
				.query(SQL);
	
				if(result.recordset.length > 0) {
					min = result.recordset[0].OCCUPIED_TIME;
				}
				
			} catch(err) {
				ERROR_LOGGER(0,'SEAT_ITEM_USE_MIN: '+err);
			}
			return min;
		}

		async function COMPUTE_TOTAL_YEN(temp_uriage_dtl,tbluriage) {
			
			let taxRate = 0;
			let syoukeiYen = 0;
			let tSyoukeiYen = 0;
			let TaxYen = 0;
			let DiscountYen = 0;
			let TDiscountYen = 0;
			let CreditYen = 0;
			let MaebaraiYen = 0;
			let TMaebaraiYen = 0;
			let TotalYen = 0;
			let TTotalYen = 0;
			let ZanSeisanYen = 0;
			let ChangeYen = 0;
			let UsePoint = 0;
			let AddPoint = 0;
			let TTaxYen = 0;
	
			let TDiscountAccess = 0;
			let TotalCreditYenTemp = 0;
	
			try {
				
				taxRate = await TAX_RATE(SEISAN_DATE.split(' ')[0]);
	
				DiscountYen = 0;
				SyoukeiYen = 0;
				MaebaraiYen = 0;
				TaxYen = 0;
				TotalYen = 0;
	
				// compute all temp_uriage_dtl
	
				for(let i in temp_uriage_dtl) {
					let obj = temp_uriage_dtl[i];
					if(obj.ITEM_KBN != 5) {
						syoukeiYen += obj.TOTAL_YEN;
					} else {
						DiscountYen += obj.TOTAL_YEN;
					}
					
				}
	
				MaebaraiYen = tbluriage.MAEUKE_YEN;
	
				//Tax Yen
				// TaxYen = Common.CalcTaxPrice(TaxRate, SyoukeiYen, Shop.TAX_FLG);
	
				let _MST_SHOP = await GET_MST_SHOP();
	
				// Tax Yen
				TaxYen = await CALC_TAX_PRICE(taxRate,syoukeiYen,_MST_SHOP[0].TAX_FLG);
	
				// Total Yen
				if(_MST_SHOP[0].TAX_FLG == 0) {
					TotalYen = syoukeiYen + DiscountYen;
				} else {
					TotalYen = syoukeiYen + TaxYen + DiscountYen;
				}
	
				TotalYen = (TotalYen < 0) ? 0 : TotalYen;
	
				// tbluriage.SHOUKEI_YEN = syoukeiYen;
				// tbluriage.GOUKEI_YEN = TotalYen;
				// tbluriage.URIAGE_YEN = TotalYen;
				// tbluriage.TAX_KBN = _MST_SHOP[0].TAX_FLG;
				// tbluriage.TAX_YEN = TaxYen;
	
				// TMaebaraiYen += MaebaraiYen;
				// TSyoukeiYen += SyoukeiYen;
				// TDiscountYen += DiscountYen;
				// TTotalYen += TotalYen;
				// TTaxYen += TaxYen;
	
				TMaebaraiYen = MaebaraiYen;
				tSyoukeiYen = syoukeiYen;
				TDiscountYen = DiscountYen;
				TTotalYen = TotalYen;
				TTaxYen = TaxYen;

				tbluriage.SHOUKEI_YEN = tSyoukeiYen;
				tbluriage.GOUKEI_YEN = TotalYen;
				tbluriage.URIAGE_YEN = TotalYen;
				tbluriage.TAX_KBN = _MST_SHOP[0].TAX_FLG;
				tbluriage.TAX_YEN = TTaxYen;
	
				if(DiscountYen * -1 > syoukeiYen) {
					TDiscountAccess = (DiscountYen * -1) - syoukeiYen;
				}
	
				// ZanSeisanYen = TTotalYen - CreditYen - TMaebaraiYen - tbluriage.USE_POINT;
				// ZanSeisanYen = (ZanSeisanYen < 0) ? 0 : ZanSeisanYen;
				
				let returnObj = {
					SyoukeiYen:tSyoukeiYen,
					TaxYen:TTaxYen,
					GoukeiYen:tbluriage.GOUKEI_YEN,
					UriageYen:tbluriage.URIAGE_YEN
					// DiscountYen:TDiscountYen,
					// CreditYen:CreditYen,
					// MaebaraiYen:TMaebaraiYen,
	
					// ZanSeisanYen:ZanSeisanYen - TDiscountAccess,
					// UsePoint:tbluriage.USE_POINT,
					// ChangeYen:(ChangeYen < 0) ? 0 : ChangeYen,
					// AddPoint:AddPoint
				};
	
				// TotalCreditYenTemp = Convert.ToInt32(lblCreditYen.Value);
				return returnObj;
			} catch(err) {
				ERROR_LOGGER(0,'COMPUTE_TOTAL_YEN: '+err);
			}
	
		}

		async function GET_MST_SHOP() {
			try {
				let result = await pool.request()
				.query("SELECT * FROM MST_SHOP;");
				if(result.recordset.length > 0) {
					return result.recordset;
				} else {
					return false;
				}
			} catch(err) {
				ERROR_LOGGER(0,'MST_SHOP: '+err);
			}
		}
	
		async function CALC_TAX_PRICE(taxRate,price,taxKbn) {
	
			let result = 0;
	
			try {
	
				if(taxKbn == 0) {
					result = Math.floor(price / (100 + taxRate) * taxRate);
				}
	
			} catch(err) {
				ERROR_LOGGER(0,'CALC_TAX_PRICE: '+err);
			}
			return result;
		}

    async function closeConnection() {
    	return await sql.close();
    }

    async function sendError(code,name) {
    	return_error = code;
			console.log(name);
			sql.close();
    	return res.json(return_error);
    }
});
//#endregion API-SALES

//#region API-GASSAN_SALES_NO
// :gassan_sales_no([0-9]{12})
app.post('/api/gassan_sales_no', async (req,res) => {
	let return_json = {};

	let pool = await sql.connect(config);

	try {

		let MST_SHOP_query = "SELECT * FROM [MST_SHOP];";
		MST_SHOP_query = await pool.request()
		.query(MST_SHOP_query);

		if(MST_SHOP_query.recordset.length > 0) {
			MST_SHOP_query = MST_SHOP_query.recordset[0];

			// update mst shop
			let UPDATE_MST_SHOP = await pool.request()
			.input('GASSAN_SALES_NO', sql.BigInt, parseInt(MST_SHOP_query.ARG_GASSAN_SALES_NO) + 1)
			.query("UPDATE [MST_SHOP] SET [ARG_GASSAN_SALES_NO] = @GASSAN_SALES_NO")
			.then((result) => {
				if(result.rowsAffected > 0) {
					return_json.GASSAN_SALES_NO = padding(MST_SHOP_query.ARG_GASSAN_SALES_NO,11,'0');
					const logMsg = `API-GASSAN: Success request`;
					const data = return_json;
					MONITOR_LOG(200,logMsg,data,res,true);
					// sql.close();
					// return res.status(200).json(return_json);
				} else {
					sql.close();
					return res.status(404).json(return_json = CNST_ERROR_CODE.error_11);
				}
			});
			
		} else {
			sql.close();
			return res.status(404).json(return_json = CNST_ERROR_CODE.error_11);
		}

	} catch(err) {
		sendError(CNST_ERROR_CODE.error_11,'gassan_sales_no\n'+err);
	}
 
	function padding(target,num,padded) {
		try{
			let _pad = padded;
			for(let i = 0; i < num; i++) {
				if(_pad.concat(target).length == num) {
					return 'G'+_pad.concat(target);
				}
				_pad = _pad.concat(padded);
			}

		} catch(err) {
			sendError(CNST_ERROR_CODE.error_11,'padding\n'+err);
		}
	}

	async function closeConnection() {
    	return await sql.close();
    }

	async function sendError(code,name) {
    	return_error.error = code;
			console.log(name);
			sql.close();
    	res.json(return_error);
    	return;
    }
	
});
//#endregion API-GASSAN_SALES_NO

//#region API-INIT
app.post('/api/init', async (req,res) => {
	let return_json = {};
	const BASE_MIN = 120;
	let pool = await sql.connect(config);
	try {

		let MST_SHOP = "SELECT * FROM MST_SHOP";
		MST_SHOP = await pool.request()
		.query(MST_SHOP);

		if(MST_SHOP.recordset.length == 0)  {
			console.log('MST_SHOP');
			sql.close();
			return res.status(404).json(CNST_ERROR_CODE.error_2);
		}

		let MST_STAFF = "SELECT * FROM MST_STAFF WHERE STAFF_ID = @STAFF_ID";
		MST_STAFF = await pool.request()
		.input('STAFF_ID', sql.NVarChar, CNST_STAFF_ID)
		.query(MST_STAFF);

		if(MST_STAFF.recordset.length == 0)  {
			console.log('MST_STAFF');
			sql.close();
			return res.status(404).json(CNST_ERROR_CODE.error_2);
		}

		MST_STAFF = MST_STAFF.recordset[0];
		MST_SHOP = MST_SHOP.recordset[0];

		let MST_TAX = "SELECT TOP 1 [START_DATE], [TAX_RATE] FROM  [MST_TAX]  ORDER BY [START_DATE] DESC;";
		MST_TAX = await pool.request()
		.query(MST_TAX);

		if(MST_TAX.recordset.length == 0)  {
			console.log('MST_TAX');
			sql.close();
			return res.status(404).json(CNST_ERROR_CODE.error_2);
		}

		MST_TAX = MST_TAX.recordset[0];

		let split_datetime = convert_datetime(MST_TAX.START_DATE).split(' ');

		let mstShopDetails = {
			"MST_SHOP":{
				"SHOP_NM":MST_SHOP.SHOP_NM,
				"POST_NO":MST_SHOP.SHOP_POST,
				"ADDRESS":MST_SHOP.SHOP_ADD1+' '+MST_SHOP.SHOP_ADD2+' '+MST_SHOP.SHOP_ADD3,
				"PHONE_NO":MST_SHOP.SHOP_TEL,
				"FC_NO":MST_SHOP.SHOP_FC_NO,
				"DEPOSIT":MST_SHOP.POOL_PRICE
			},
			"MST_TAX":{
				"START_DATE":split_datetime[0],
				"TAX_RATE":MST_TAX.TAX_RATE
			},
			"MST_EX_SEAT_ITEM":{
				"BASE_MIN" : BASE_MIN
			},
			"MST_STAFF" : {
				"STAFF_ID" : CNST_STAFF_ID,
				"STAFF_NM" : MST_STAFF.STAFF_NM
			}
		};

		return_json = mstShopDetails;
		sql.close();
		return res.status(200).json(return_json);
	} catch(err) {
		console.log('API-INIT\n'+err);
		sql.close();
		return res.status(200).json(CNST_ERROR_CODE.error_11);
	}

});
//#endregion API-INIT

//#region API-DEPOSIT
app.post('/api/deposit', async (req,res) => {

	let SQL = '';
	let pool = await sql.connect(config);

	try {

		let postDataRules = {
			"SALES_NO":"Required Sales no", 
			"MEMBER_ID":"Required Member ID",
			"DEPOSIT_AMOUNT":"Required Deposit Amount",
			"AWAY_TIME":"Required Away time"
		}
		
		postValidation(postDataRules,req.body)
		.then(async(result) => {
			
			let SALES_NO = req.body.SALES_NO;
			let MEMBER_ID = req.body.MEMBER_ID;
			let DEPOSIT_AMOUNT = req.body.DEPOSIT_AMOUNT;
			let AWAY_TIME = req.body.AWAY_TIME;

			// let GET_TBL_URIAGE = await pool.request()
			// .input('SALES_NO', sql.VarChar, SALES_NO)
			// .query("SELECT SEAT_NO FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO;");

			// let TBL_GATE_SEQ = await pool.request()
			// .input('SEAT_NO', sql.VarChar, SALES_NO)
			// .query("SELECT TOP 1 SEQ FROM TBL_GATE WHERE SEAT_NO = @SEAT_NO AND LOGIN_FLG = 1 AND OPEN_FLG = 1 ORDER BY SEQ DESC;");

			// console.log(TBL_GATE_SEQ);
			// return res.end();

			// VALIDATE SALES NO AND MEMBER ID
			SQL = "SELECT * FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO AND MEMBER_ID = @MEMBER_ID";
			let VALIDATE_SALES_NO = await pool.request()
			.input('SALES_NO', sql.VarChar,SALES_NO)
			.input('MEMBER_ID', sql.VarChar,MEMBER_ID)
			.query(SQL);

			if(VALIDATE_SALES_NO.recordset.length > 0) {

				// VALIDATE DEPOSIT VALUE
				let regexp = new RegExp('^(?:[1-9]|[1-9][0-9]+)$');
				if(!regexp.test(DEPOSIT_AMOUNT)) {
					console.log('VALIDATE DEPOSIT VALUE');
					sql.close();
					return res.status(200).send(CNST_ERROR_CODE.error_2);
				}

				const transaction = pool.transaction();

				transaction.begin(async err => {

					transaction.on('rollback', aborted => {
						sql.close();
						return res.status(200).send(CNST_ERROR_CODE.error_11);
					});
					transaction.on('commit', () => {
						sql.close();

						

						return res.status(200).send(CNST_ERROR_CODE.error_0);
					});
	
					SQL = "UPDATE [TBL_URIAGE] SET MAEUKE_YEN = @DEPOSIT_AMOUNT WHERE [SALES_NO] = @SALES_NO AND [MEMBER_ID] = @MEMBER_ID;";
					transaction.request()
					.input('DEPOSIT_AMOUNT', sql.Int, DEPOSIT_AMOUNT)
					.input('SALES_NO', sql.VarChar, SALES_NO)
					.input('MEMBER_ID', sql.VarChar, MEMBER_ID)
					.query(SQL,async(err,result) => {
						if(err) return transaction.rollback();
						// transaction.commit();

						let GET_TBL_URIAGE = await pool.request()
						.input('SALES_NO', sql.VarChar, SALES_NO)
						.query("SELECT SEAT_NO FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO;");

						let TBL_GATE_SEQ = await pool.request()
						.input('SEAT_NO', sql.VarChar, SALES_NO)
						.query("SELECT TOP 1 SEQ FROM TBL_GATE WHERE SEAT_NO = @SEAT_NO AND LOGIN_FLG = 1 AND OPEN_FLG = 1 ORDER BY SEQ DESC;");

						// UPDATE TBL_GATE
						transaction.request()
						.input('SEAT_NO', sql.VarChar, GET_TBL_URIAGE.recordset[0].SEAT_NO)
						.input('SEQ', sql.VarChar, TBL_GATE_SEQ.recordset[0].SEQ)
						.query("UPDATE TBL_GATE SET LOGIN_FLG = 3, OPEN_FLG = 0 WHERE SEAT_NO = @SEAT_NO AND SEQ = @SEQ;",async(err,result) => {
							if(err) return transaction.rollback();
							// INSERT AWAY SHOP
							transaction.request()
							.input('SALES_NO', sql.VarChar, SALES_NO)
							.input('MEMBER_ID', sql.VarChar, MEMBER_ID)
							.input('AWAY_TIME', sql.VarChar, AWAY_TIME)
							.query("INSERT INTO TBL_AWAY_SHOP (SALES_NO,MEMBER_ID,AWAY_TIME) VALUES(@SALES_NO,@MEMBER_ID,@AWAY_TIME)",async(err,result) => {
								if(err) return transaction.rollback();
								transaction.commit();
							});

						});

					});
	
				});

				// let GET_TBL_URIAGE = await pool.request()
				// .input('SALES_NO', sql.VarChar, SALES_NO)
				// .query("SELECT SEAT_NO FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO;");

				// let TBL_GATE_SEQ = await pool.request()
				// .input('SEAT_NO', sql.VarChar, SALES_NO)
				// .query("SELECT TOP 1 SEQ FROM TBL_GATE WHERE SEAT_NO = @SEAT_NO AND LOGIN_FLG = 1 AND OPEN_FLG = 1 ORDER BY SEQ DESC;");

				// // UPDATE TBL_GATE
				// let UPDATE_TBL_GATE = await pool.request()
				// .input('SEAT_NO', sql.VarChar, GET_TBL_URIAGE.recordset[0].SEAT_NO)
				// .input('SEQ', sql.VarChar, TBL_GATE_SEQ.recordset[0].SEQ)
				// .query("UPDATE TBL_GATE SET LOGIN_FLG = 3, OPEN_FLG = 0 WHERE SEAT_NO = @SEAT_NO AND SEQ = @SEQ;");

				// // INSERT AWAY SHOP
				// let INSERT_TBL_AWAY_SHOP = await pool.request()
				// .input('SALES_NO', sql.VarChar, SALES_NO)
				// .input('MEMBER_ID', sql.VarChar, MEMBER_ID)
				// .input('AWAY_TIME', sql.VarChar, AWAY_TIME)
				// .query("INSERT INTO TBL_AWAY_SHOP (SALES_NO,MEMBER_ID,AWAY_TIME) VALUES(@SALES_NO,@MEMBER_ID,@AWAY_TIME)");

			} else {
				console.log('TBL_URIAGE no data');
				sql.close();
				return res.status(200).send(CNST_ERROR_CODE.error_2);
			}

		})
		.catch((err) => {
			console.log('API-DEPOSIT post validation\n'+err);
			sql.close();
			return res.status(200).send(CNST_ERROR_CODE.error_3);
			// sendError(CNST_ERROR_CODE.error_3,'deposit: '+err,res);
		});

	} catch(err) {
		console.log('API-DEPOST\n'+err);
		sql.close();
		return res.status(200).send(CNST_ERROR_CODE.error_11);
		// sendError(CNST_ERROR_CODE.error_11,'API-DEPOSIT\n'+err,res);
	}

});
//#endregion API-DEPOSIT

//#region API-PAID
app.post('/api/paid', async (req,res) => {
	let pool = await sql.connect(config);
	let reqParam = req.body;
	let success = false;
	const SEISAN_DATE = dateTimeNow();
	let totalDiscountYen = 0;
	let totalYen = 0;
	let discountYen = 0;
	
	let affectedRows = 0;

	let totalPrice = 0
	let SEQ = 0;
	let newMemberCnt = 0;

	let salesCount = reqParam.SALES_DATA.length;

	let _UPDATE_SEAT_STATUS;

	// _UPDATE_SEAT_STATUS = await UPDATE_SEAT_STATUS(reqParam.SEAT_NO,1,CNST_STAFF_ID);

	let PRICE_LIMIT_FLG = (parseInt(reqParam.ALL_TOTAL) >> 50000)?true:false;

	let _VALIDATE_LOGOUT_PARAM = await VALIDATE_LOGOUT_PARAM(reqParam);

	if(_VALIDATE_LOGOUT_PARAM) {

		if(salesCount == 1) {
			// let DO_SINGLE_SALES_NO = await SINGLE_SALES_NO2(reqParam);
			let DO_SINGLE_SALES_NO = await SINGLE_SALES_NO(reqParam,PRICE_LIMIT_FLG);
			SQL = "UPDATE MST_SEAT SET SEAT_STATUS = @SEAT_STATUS, UPDATE_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID WHERE SEAT_NO = @SEAT_NO";
			let UPDATE_MST_SEAT = await pool.request()
			.input("SEAT_STATUS", sql.Int, 3)
			.input("SEAT_NO", sql.NVarChar, reqParam.SALES_DATA[0].TBL_URIAGE.SEAT_NO) // 
			.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
			.query(SQL);
			sql.close();
			return res.status(200).send(CNST_ERROR_CODE.error_0);
		} else if(salesCount > 1) {

			let { TBL_GASSAN } = reqParam;
			let GassanSeq = 0;
			let SQL = '';
			//#region TBL_GASSAN
			try {
				let VisitorCount = await MULTIPLE_SALES_NO(reqParam,GassanSeq,PRICE_LIMIT_FLG);

				let uriage_yen = 0;

				SQL = "INSERT INTO TBL_GASSAN (GASSAN_NO, GASSAN_CNT, NEW_MEMBER_CNT, TOTAL_YEN, URIAGE_YEN, MAEBARAI_YEN, AZUKARI_YEN, CREDIT_YEN, CHANGE_YEN, DELETE_FLG, INPUT_STAFF_ID, INPUT_DATE, TAX_YEN, TAX_KBN)VALUES (@GASSAN_NO, @GASSAN_CNT, @NEW_MEMBER_CNT, @TOTAL_YEN, @URIAGE_YEN, @MAEBARAI_YEN, @AZUKARI_YEN, @CREDIT_YEN, @CHANGE_YEN, 0, @INPUT_STAFF_ID, @INPUT_DATE, @TAX_YEN, @TAX_KBN)";
				let INSERT_TBL_GASSAN = await pool.request()
				.input("GASSAN_NO", sql.VarChar(12), TBL_GASSAN.GASSAN_NO)
				.input("GASSAN_CNT", sql.Int, VisitorCount)
				.input("NEW_MEMBER_CNT", sql.Int, newMemberCnt)
				.input("TOTAL_YEN", sql.Int, TBL_GASSAN.TOTAL_YEN)
				.input("URIAGE_YEN", sql.Int, TBL_GASSAN.URIAGE_YEN)
				.input("MAEBARAI_YEN", sql.Int, TBL_GASSAN.MAEBARAI_YEN)
				.input("AZUKARI_YEN", sql.Int, TBL_GASSAN.AZUKARI_YEN)
				.input("CREDIT_YEN", sql.Int, TBL_GASSAN.CREDIT_YEN)
				.input("CHANGE_YEN", sql.Int, TBL_GASSAN.CHANGE_YEN)
				.input("INPUT_STAFF_ID", sql.VarChar(12), CNST_STAFF_ID)
				.input("INPUT_DATE", sql.DateTime2(0), SEISAN_DATE)
				.input("TAX_YEN", sql.Int, TBL_GASSAN.TAX_YEN)
				.input("TAX_KBN", sql.Int, 0)
				.query(SQL);

				//close connection
				
				let _END_PROC = await END_PROC();
			} catch(err) {
				ERROR_LOGGER(CNST_ERROR_CODE.error_11,'AFTER MULTIPLE_SALES_DATA\n'+err);
			}
			//#endregion TBL_GASSAN
		}

	} else {
		ERROR_LOGGER(CNST_ERROR_CODE.error_11,'_VALIDATE_LOGOUT_PARAM\n');
	}

	async function END_PROC() {
		sql.close();
		return res.status(200).send(CNST_ERROR_CODE.error_0);
	}

	async function UPLOAD_SALES(jsonSales,callback) {
		const request = await require('request');
		const request_opt = {
			method: 'post',
			body: jsonSales,
			json: true,
			url: 'http://acrossweb.net/upload/sales'
		};
		let returnCode = CNST_ERROR_CODE.error_11;

		try {

			request(request_opt,(err, httpResponse, body) => {
				if(err) ERROR_LOGGER(CNST_ERROR_CODE.error_1,'VERIFICATION ERROR\n'+err);
				// returnCode = body;
				callback(body);
	
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

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'UPLOAD_SALES\n');
		}

		return returnCode;
		
	}
	
	async function TBL_URIAGE_DTL(uriageDtl,seisanHolidayFlg,shopFcNo) {
		let returnObj = [];
		let SQL = '';
		try{
			for(let i = 0; i < uriageDtl.length; i++) {
				let iObj = uriageDtl[i];
				SQL = "SELECT * FROM TBL_URIAGE_DTL WHERE SEAT_NO = @SEAT_NO AND SALES_NO = @SALES_NO"
				let query = await pool.request()
				.input('SEAT_NO', sql.VarChar, iObj.SEAT_NO)
				.input('SALES_NO', sql.VarChar, iObj.SALES_NO)
				.query(SQL);
				if(query.recordset.length > 0) {
					for(let iUriageDtl = 0; iUriageDtl < query.recordset.length;iUriageDtl++) {
						query.recordset[iUriageDtl]["SHOP_FC_NO"] = shopFcNo;
						query.recordset[iUriageDtl].INPUT_DATE = (query.recordset[iUriageDtl].INPUT_DATE == null)?null:convert_datetime(query.recordset[iUriageDtl].INPUT_DATE);
						query.recordset[iUriageDtl].SEAT_USE_START_DATE = (query.recordset[iUriageDtl].SEAT_USE_START_DATE == null)?null:convert_datetime(query.recordset[iUriageDtl].SEAT_USE_START_DATE);
						query.recordset[iUriageDtl].UPDATE_DATE = (query.recordset[iUriageDtl].UPDATE_DATE == null)?null:convert_datetime(query.recordset[iUriageDtl].UPDATE_DATE);
						query.recordset[iUriageDtl]['SEISAN_HOLIDAY_FLG'] = seisanHolidayFlg;
						returnObj.push(query.recordset[iUriageDtl]);
					}
				} else {
					throw 'No match found';
				}
			}
		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'TBL_URIAGE_DTL\n'+err);
		}
		return returnObj;
	}

	async function TBL_SEAT_STATUS(tblSeatStatus,loginHolidayFlg,seisanHolidayFlg,shopFcNo) {
		let returnObj = [];
		let SQL = '';

		try {

			SQL = "SELECT * FROM TBL_SEAT_STATUS WHERE SALES_NO = @SALES_NO";
			let query = await pool.request()
			.input('SALES_NO', sql.VarChar, tblSeatStatus.SALES_NO)
			.query(SQL);
			if(query.recordset.length > 0) {
				for(let i = 0; i < query.recordset.length; i++) {
					query.recordset[i]["SHOP_FC_NO"] = shopFcNo;
					query.recordset[i].INPUT_DATE = (query.recordset[i].INPUT_DATE == null)?null:convert_datetime(query.recordset[i].INPUT_DATE);
					query.recordset[i].LOGIN_DATE = (query.recordset[i].LOGIN_DATE == null)?null:convert_datetime(query.recordset[i].LOGIN_DATE);
					query.recordset[i].UPDATE_DATE = (query.recordset[i].UPDATE_DATE == null)?null:convert_datetime(query.recordset[i].UPDATE_DATE);
					query.recordset[i].USE_START_DATE = (query.recordset[i].USE_START_DATE == null)?null:convert_datetime(query.recordset[i].USE_START_DATE);
					query.recordset[i]["LOGIN_HOLIDAY_FLG"] = loginHolidayFlg;
					query.recordset[i]["SEISAN_HOLIDAY_FLG"] = seisanHolidayFlg;
					returnObj.push(query.recordset[i]);
				}
			} else {
				throw 'No match found';
			}

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'TBL_SEAT_STATUS\n'+err);
		}
		return returnObj;
	}

	async function TBL_CREDIT_RIREKI(tblCreditRireki,loginHolidayFlg,seisanHolidayFlg) {
		let returnObj = [];
		let SQL = '';

		try {

			SQL = "SELECT * FROM TBL_CREDIT_RIREKI WHERE SALES_NO = @SALES_NO";
			let query = await pool.request()
			.input('SALES_NO', sql.VarChar, tblCreditRireki.SALES_NO)
			.query(SQL);
			if(query.recordset.length > 0) {
				for(let i = 0; i < query.recordset.length; i++) {
					query.recordset[i].INPUT_DATE = (query.recordset[i].INPUT_DATE == null)?null:convert_datetime(query.recordset[i].INPUT_DATE);
					// query.recordset[i].LOGIN_DATE = (query.recordset[i].LOGIN_DATE == null)?null:convert_datetime(query.recordset[i].LOGIN_DATE);
					query.recordset[i].UPDATE_DATE = (query.recordset[i].UPDATE_DATE == null)?null:convert_datetime(query.recordset[i].UPDATE_DATE);
					query.recordset[i].SEISAN_DATE = (query.recordset[i].SEISAN_DATE == null)?null:convert_datetime(query.recordset[i].SEISAN_DATE);
					query.recordset[i]["LOGIN_HOLIDAY_FLG"] = loginHolidayFlg;
					query.recordset[i]["SEISAN_HOLIDAY_FLG"] = seisanHolidayFlg;
					returnObj.push(query.recordset[i]);
				}
			} else {
				throw 'No match found';
			}

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'TBL_SEAT_STATUS\n'+err);
		}
		return returnObj;
	}

	async function MST_SEAT(mstSeat,loginHolidayFlg,seisanHolidayFlg,seatNo) {
		let returnObj = [];
		let SQL = '';

		try {

			SQL = "SELECT * FROM MST_SEAT WHERE SEAT_NO = @SEAT_NO";
			let query = await pool.request()
			.input('SEAT_NO', sql.VarChar, seatNo)
			.query(SQL);
			if(query.recordset.length > 0) {
				for(let i = 0; i < query.recordset.length; i++) {
					query.recordset[i].INPUT_DATE = (query.recordset[i].INPUT_DATE == null)?null:convert_datetime(query.recordset[i].INPUT_DATE);
					// query.recordset[i].LOGIN_DATE = (query.recordset[i].LOGIN_DATE == null)?null:convert_datetime(query.recordset[i].LOGIN_DATE);
					query.recordset[i].UPDATE_DATE = (query.recordset[i].UPDATE_DATE == null)?null:convert_datetime(query.recordset[i].UPDATE_DATE);
					// query.recordset[i].SEISAN_DATE = (query.recordset[i].SEISAN_DATE == null)?null:convert_datetime(query.recordset[i].SEISAN_DATE);
					query.recordset[i]["LOGIN_HOLIDAY_FLG"] = loginHolidayFlg;
					query.recordset[i]["SEISAN_HOLIDAY_FLG"] = seisanHolidayFlg;
					returnObj.push(query.recordset[i]);
				}
			} else {
				throw 'No match found';
			}

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'TBL_SEAT_STATUS\n'+err);
		}
		return returnObj;
	}

	async function TBL_GASSAN(tblGassan,loginHolidayFlg,seisanHolidayFlg) {
		let returnObj = [];
		let SQL = '';

		try {

			SQL = "SELECT * FROM TBL_GASSAN WHERE GASSAN_NO = @GASSAN_NO";
			let query = await pool.request()
			.input('GASSAN_NO', sql.VarChar, tblGassan.GASSAN_NO)
			.query(SQL);
			if(query.recordset.length > 0) {
				for(let i = 0; i < query.recordset.length; i++) {
					query.recordset[i].INPUT_DATE = (query.recordset[i].INPUT_DATE == null)?null:convert_datetime(query.recordset[i].INPUT_DATE);
					// query.recordset[i].LOGIN_DATE = (query.recordset[i].LOGIN_DATE == null)?null:convert_datetime(query.recordset[i].LOGIN_DATE);
					query.recordset[i].UPDATE_DATE = (query.recordset[i].UPDATE_DATE == null)?null:convert_datetime(query.recordset[i].UPDATE_DATE);
					// query.recordset[i].SEISAN_DATE = (query.recordset[i].SEISAN_DATE == null)?null:convert_datetime(query.recordset[i].SEISAN_DATE);
					query.recordset[i]["LOGIN_HOLIDAY_FLG"] = loginHolidayFlg;
					query.recordset[i]["SEISAN_HOLIDAY_FLG"] = seisanHolidayFlg;
					returnObj.push(query.recordset[i]);
				}
			} else {
				throw 'No match found';
			}

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'TBL_SEAT_STATUS\n'+err);
		}
		return returnObj;
	}

	async function VALIDATE_LOGOUT_PARAM(data) {
		let SQL = '';
		let bool = false;
		try {
			for(let i in data.SALES_DATA) {
				let { MST_SEAT,TBL_CREDIT_RIREKI,TBL_SEAT_STATUS,TBL_URIAGE,TBL_URIAGE_DTL } = data.SALES_DATA[i];

				// MST_SEAT VALIDATION
				SQL = "SELECT * FROM MST_SEAT WHERE SEAT_NO = @SEAT_NO";
				let _MST_SEAT = await pool.request()
				.input('SEAT_NO', sql.VarChar, MST_SEAT.SEAT_NO)
				.query(SQL);
				if(_MST_SEAT.recordset.length == 0) {
					throw `MST_SEAT(${i}):SEAT_NO No match found`;
				}
				// TBL_CREDIT_RIREKI
				// if(TBL_CREDIT_RIREKI != null) {
				// 	SQL = "SELECT * FROM TBL_CREDIT_RIREKI WHERE SALES_NO = @SALES_NO AND MEMBER_ID = @MEMBER_ID";
				// 	let _TBL_CREDIT_RIREKI = await pool.request()
				// 	.input('SALES_NO', sql.VarChar, TBL_CREDIT_RIREKI.SALES_NO)
				// 	.input('MEMBER_ID', sql.VarChar, TBL_CREDIT_RIREKI.MEMBER_ID)
				// 	.query(SQL);
				// 	if(_TBL_CREDIT_RIREKI.recordset.length == 0) {
				// 		throw `TBL_CREDIT_RIREKI(${i}):SALES_NO,MEMBER_ID No match found`;
				// 	}
				// }

				// TBL_SEAT_STATUS
				SQL = "SELECT * FROM TBL_SEAT_STATUS WHERE SALES_NO = @SALES_NO";
				let _TBL_SEAT_STATUS = await pool.request()
				.input('SALES_NO', sql.VarChar, TBL_SEAT_STATUS.SALES_NO)
				.query(SQL);
				if(_TBL_SEAT_STATUS.recordset.length == 0) {
					throw `TBL_SEAT_STATUS(${i}):SALES_NO No match found`;
				}

				// TBL_URIAGE
				SQL = "SELECT * FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO AND SEAT_NO = @SEAT_NO";
				let _TBL_URIAGE = await pool.request()
				.input('SALES_NO', sql.VarChar, TBL_URIAGE.SALES_NO)
				.input('SEAT_NO', sql.VarChar, TBL_URIAGE.SEAT_NO)
				.query(SQL);
				if(_TBL_URIAGE.recordset.length == 0) {
					throw `TBL_URIAGE(${i}):SALES_NO,SEAT_NO No match found`;
				}

				// TBL_URIAGE_DTL = Object
				for(let udtl in TBL_URIAGE_DTL) {
					let udtlObj = TBL_URIAGE_DTL[udtl];
					SQL = "SELECT * FROM TBL_URIAGE_DTL WHERE SALES_NO = @SALES_NO AND SEAT_NO = @SEAT_NO";
					let _TBL_URIAGE_DTL = await pool.request()
					.input('SALES_NO', sql.VarChar, udtlObj.SALES_NO)
					.input('SEAT_NO', sql.VarChar, udtlObj.SEAT_NO)
					.query(SQL);
					if(_TBL_URIAGE_DTL.recordset.length == 0) {
						throw `TBL_URIAGE(${i})(${udtl}):SALES_NO,SEAT_NO No match found`;
						break;
					}
				}

			}
			bool = true;
		} catch(err) {
			const logMsg = `VALIDATE_LOGOUT_PARAM\n${err}`;
			const data = CNST_ERROR_CODE.error_11;
			MONITOR_LOG(400,logMsg,data,res,true);
			// console.log('VALIDATE_LOGOUT_PARAM\n',err);
			// sql.close();
			// return res.status(400).send(CNST_ERROR_CODE.error_11);
		}
		return bool;
	}

	async function SINGLE_SALES_NO(uriageDtlObj,PRICE_LIMIT_FLG) {

		var success = false;
		var SQL = '';
		
		var totalDiscountYen = 0;
		var totalYen = 0;
		var discountYen = 0;
		
		var affectedRows = 0;

		var totalPrice = 0
		var SEQ = 0;

		var appMemberId = '';

		var seisanDate = uriageDtlObj.LOGOUT_DATE;

		try {
			for(let iSalesData in uriageDtlObj.SALES_DATA) {

				let iSalesDataObj = uriageDtlObj.SALES_DATA[iSalesData];

				let JSON_MST_SEAT = iSalesDataObj.MST_SEAT;
				let JSON_TBL_CREDIT_RIREKI = iSalesDataObj.TBL_CREDIT_RIREKI;
				let JSON_TBL_SEAT_STATUS = iSalesDataObj.TBL_SEAT_STATUS;
				let JSON_TBL_URIAGE = iSalesDataObj.TBL_URIAGE;
				let JSON_TBL_URIAGE_DTL = iSalesDataObj.TBL_URIAGE_DTL;
	
				let GET_TBL_URIAGE = await TBL_URIAGE(JSON_TBL_URIAGE.SEAT_NO,JSON_TBL_URIAGE.SALES_NO);
				GET_TBL_URIAGE = GET_TBL_URIAGE[0];
	
				// let GET_TOKEN_URIAGE_DTL_TEMP = await TOKEN_URIAGE_DTL_TEMP(uriageDtlObj.TOKEN_ID,iSalesDataObj.SALES_NO);
	
				// let GET_COMPUTE_TOTAL_YEN = await COMPUTE_TOTAL_YEN(GET_TOKEN_URIAGE_DTL_TEMP,GET_TBL_URIAGE);
	
				// GET_TBL_URIAGE_USE_MIN = await SEAT_ITEM_USE_MIN(GET_TBL_URIAGE.SALES_NO,seisanDate);
	
				// GET_TBL_URIAGE.USE_MIN = GET_TBL_URIAGE_USE_MIN;
				
				let UPDATE_TBL_URIAGE = await pool.request()
				/* .input('SALES_NO', sql.VarChar(12), GET_TBL_URIAGE.SALES_NO)
				.input('SEISAN_DATE', sql.DateTime2(0), seisanDate)
				.input('USE_MIN', sql.Int, GET_TBL_URIAGE.USE_MIN)
				.input('SHOUKEI_YEN', sql.Int, GET_TBL_URIAGE.SHOUKEI_YEN)
				.input('GOUKEI_YEN', sql.Int, GET_TBL_URIAGE.GOUKEI_YEN)
				.input('MAEUKE_YEN', sql.Int, GET_TBL_URIAGE.MAEUKE_YEN)
				.input('AZUKARI_YEN', sql.Int, uriageDtlObj.AZUKARI_YEN)
				.input('CHANGE_YEN', sql.Int, GET_COMPUTE_TOTAL_YEN.ChangeYen)
				.input('USE_POINT', sql.Int, GET_TBL_URIAGE.USE_POINT)
				.input('URIAGE_YEN', sql.Int, GET_TBL_URIAGE.URIAGE_YEN)
				.input('SEISAN_FLG', sql.TinyInt, 1)
				.input('ADD_POINT', sql.Int, GET_TBL_URIAGE.ADD_POINT)
				.input('TAX_YEN', sql.Int, GET_TBL_URIAGE.TAX_YEN)
				.input('SEAT_NO', sql.VarChar(4), GET_TBL_URIAGE.SEAT_NO)
				.input('UPDATE_STAFF_ID', sql.VarChar(20), CNST_STAFF_ID) */
				.input('SALES_NO', sql.VarChar(12), JSON_TBL_URIAGE.SALES_NO)
				.input('SEISAN_DATE', sql.DateTime2(0), SEISAN_DATE)
				.input('USE_MIN', sql.Int, GET_TBL_URIAGE.USE_MIN)
				.input('SHOUKEI_YEN', sql.Int, JSON_TBL_URIAGE.SHOUKEI_YEN)
				.input('GOUKEI_YEN', sql.Int, JSON_TBL_URIAGE.GOUKEI_YEN)
				.input('MAEUKE_YEN', sql.Int, GET_TBL_URIAGE.MAEUKE_YEN)
				.input('AZUKARI_YEN', sql.Int, JSON_TBL_URIAGE.AZUKARI_YEN)
				.input('CHANGE_YEN', sql.Int, JSON_TBL_URIAGE.CHANGE_YEN)
				.input('USE_POINT', sql.Int, GET_TBL_URIAGE.USE_POINT)
				.input('URIAGE_YEN', sql.Int, JSON_TBL_URIAGE.URIAGE_YEN)
				.input('SEISAN_FLG', sql.TinyInt, 1)
				.input('ADD_POINT', sql.Int, GET_TBL_URIAGE.ADD_POINT)
				.input('TAX_YEN', sql.Int, JSON_TBL_URIAGE.TAX_YEN)
				.input('SEAT_NO', sql.VarChar(4), JSON_TBL_URIAGE.SEAT_NO)
				.input('UPDATE_STAFF_ID', sql.VarChar(20), JSON_TBL_URIAGE.UPDATE_STAFF_ID)
				.query("UPDATE TBL_URIAGE SET SEISAN_DATE = @SEISAN_DATE ,USE_MIN = @USE_MIN ,SHOUKEI_YEN = @SHOUKEI_YEN ,GOUKEI_YEN = @GOUKEI_YEN ,MAEUKE_YEN = @MAEUKE_YEN ,AZUKARI_YEN = @AZUKARI_YEN ,CHANGE_YEN = @CHANGE_YEN ,USE_POINT = @USE_POINT ,URIAGE_YEN = @URIAGE_YEN ,SEISAN_FLG = @SEISAN_FLG ,ADD_POINT = @ADD_POINT ,TAX_YEN = @TAX_YEN ,SEAT_NO = @SEAT_NO ,UPDATE_STAFF_ID = @UPDATE_STAFF_ID ,UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO");

				// GET SEQ
				SEQ = await GET_MAX_SALES_SEQ(GET_TBL_URIAGE.SALES_NO);
				let _MST_SHOP = await MST_SHOP();
				let taxFlg = _MST_SHOP[0].TAX_FLG;
	
				// DATA FROM JSON TBL_URIAGE_DTL
				for(let i in JSON_TBL_URIAGE_DTL) {
					let jsonUriageDtl = JSON_TBL_URIAGE_DTL[i];

					let itemId = jsonUriageDtl.ITEM_ID;
					let itemNm = jsonUriageDtl.ITEM_NM;

					let UPDATE_TBL_URIAGE_DTL = '';

					if(jsonUriageDtl.ITEM_KBN == 0) {
						SQL = "UPDATE TBL_URIAGE_DTL SET ITEM_ID = @ITEM_ID, ITEM_NM = @ITEM_NM, ITEM_PRICE = @ITEM_PRICE, TOTAL_YEN = @TOTAL_YEN, SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_KBN = @ITEM_KBN AND SEQ = 0 AND DELETE_FLG = @DELETE_FLG;";
						UPDATE_TBL_URIAGE_DTL = await pool.request()
						.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
						.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input('ITEM_NM', sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
						.input('ITEM_PRICE', sql.VarChar, jsonUriageDtl.ITEM_PRICE)
						.input('TOTAL_YEN', sql.VarChar, jsonUriageDtl.TOTAL_YEN)
						.input('BASE_MIN', sql.VarChar, jsonUriageDtl.BASE_MIN)
						.input('ITEM_KBN', sql.VarChar, jsonUriageDtl.ITEM_KBN)
						.input('SEISAN_DATE', sql.DateTime2(0), SEISAN_DATE)
						.input('SEISAN_FLG', sql.VarChar, 1)
						.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input('UPDATE_STAFF_ID', sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
						.query(SQL);
					} else {
						SQL = "UPDATE TBL_URIAGE_DTL SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_ID = @ITEM_ID AND SEQ = @SEQ AND DELETE_FLG = @DELETE_FLG;";
						UPDATE_TBL_URIAGE_DTL = await pool.request()
						.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
						.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input('SEQ', sql.VarChar, jsonUriageDtl.SEQ)
						.input('SEISAN_DATE', sql.DateTime2(0), SEISAN_DATE)
						.input('SEISAN_FLG', sql.VarChar, 1)
						.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input('UPDATE_STAFF_ID', sql.VarChar, CNST_STAFF_ID)
						.query(SQL);
					}

					if(UPDATE_TBL_URIAGE_DTL.rowsAffected[0] == 0) {

						SEQ++;

						SQL = "INSERT INTO TBL_URIAGE_DTL(SALES_NO, SEQ, ITEM_SEQ, ITEM_ID, ITEM_NM, ITEM_KBN, FOOD_KBN, TAX_KBN, ITEM_QU, ITEM_PRICE, BASE_MIN, TOTAL_YEN, SEISAN_DATE, SEISAN_FLG, MAEBARAI_FLG, DELETE_FLG, RETURN_QU, SEAT_USE_START_DATE, SEAT_NO, INPUT_STAFF_ID, INPUT_DATE, UPDATE_STAFF_ID, UPDATE_DATE) VALUES(@SALES_NO, @SEQ, @ITEM_SEQ, @ITEM_ID, @ITEM_NM, @ITEM_KBN, @FOOD_KBN, @TAX_KBN, @ITEM_QU, @ITEM_PRICE, @BASE_MIN, @TOTAL_YEN, @SEISAN_DATE, @SEISAN_FLG, @MAEBARAI_FLG, @DELETE_FLG, @RETURN_QU, @SEAT_USE_START_DATE, @SEAT_NO, @INPUT_STAFF_ID, GETDATE(), @UPDATE_STAFF_ID, GETDATE())";
						let INSERT_TBL_URIAGE_DTL = await pool.request()
						.input("SALES_NO", sql.VarChar, jsonUriageDtl.SALES_NO)
						.input("SEQ", sql.VarChar, SEQ)
						.input("ITEM_SEQ", sql.VarChar, jsonUriageDtl.ITEM_SEQ)
						.input("ITEM_ID", sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input("ITEM_NM", sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
						.input("ITEM_KBN", sql.VarChar, jsonUriageDtl.ITEM_KBN)
						.input("FOOD_KBN", sql.VarChar, jsonUriageDtl.FOOD_KBN)
						.input("TAX_KBN", sql.VarChar, taxFlg)
						.input("ITEM_QU", sql.VarChar, jsonUriageDtl.ITEM_QU)
						.input("ITEM_PRICE", sql.VarChar, jsonUriageDtl.ITEM_PRICE)
						.input("TOTAL_YEN", sql.VarChar, jsonUriageDtl.TOTAL_YEN)
						.input("SEISAN_DATE", sql.DateTime2(0), SEISAN_DATE)
						.input("SEISAN_FLG", sql.VarChar, 1)
						.input("MAEBARAI_FLG", sql.VarChar, jsonUriageDtl.MAEBARAI_FLG)
						.input("DELETE_FLG", sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input("RETURN_QU", sql.VarChar, jsonUriageDtl.RETURN_QU)
						// .input("SEAT_USE_START_DATE", sql.VarChar, (jsonUriageDtl.LOGIN_DATE == null)?null:convert_datetime(jsonUriageDtl.LOGIN_DATE))
						.input("SEAT_USE_START_DATE", sql.VarChar, null)
						.input("BASE_MIN", sql.VarChar, jsonUriageDtl.BASE_MIN)
						.input("SEAT_NO", sql.VarChar, jsonUriageDtl.SEAT_NO)
						.input("INPUT_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
						.input("UPDATE_STAFF_ID", sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
						.query(SQL);
					}

					if(jsonUriageDtl.ITEM_KBN == 5) {
						totalDiscountYen += jsonUriageDtl.TOTAL_YEN;
					} else {
						totalYen += jsonUriageDtl.TOTAL_YEN;
					}
				}

				/* TBL VISITOR NOT INCLUDED */

				if(JSON_TBL_URIAGE.MEMBER_FLG == 1) {

					SQL = "UPDATE MST_MEMBER_SHOP SET MEMBER_SHOP_LOGIN_CNT = MEMBER_SHOP_LOGIN_CNT+1, MEMBER_SHOP_POINT += @MEMBER_SHOP_POINT, LAST_NYUTEN_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE(), MEMBER_SHOP_APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN MEMBER_SHOP_APP_LOGIN_CNT + 1 ELSE MEMBER_SHOP_APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
					let UPDATE_MST_MEMBER_SHOP = await pool.request()
					.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
					.input("MEMBER_SHOP_POINT", sql.VarChar, 0)
					.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID) 
					.input("APP_LOGIN_FLG", sql.VarChar, GET_TBL_URIAGE.APP_LOGIN_FLG)
					.query(SQL);

				}

				// MST_SEAT
				let UPDATE_MST_SEAT;
				let multiLogin = await MULTIPLE_LOGIN(JSON_TBL_URIAGE.SEAT_NO);
				if(multiLogin) {
					SQL = "UPDATE MST_SEAT SET LOGIN_CNT -= @LOGIN_CNT WHERE SEAT_NO = @SEAT_NO";
					UPDATE_MST_SEAT = await pool.request()
					.input('LOGIN_CNT', sql.Int, 1)
					.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
					.query(SQL);
				} else {
					SQL = "UPDATE MST_SEAT SET LOGIN_CNT = 0, SEAT_USE_SEQ = ARG_SEAT_USE_SEQ+1, ARG_SEAT_USE_SEQ += 1 WHERE SEAT_NO = @SEAT_NO";
					UPDATE_MST_SEAT = await pool.request()
					.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
					.query(SQL);	
				}

				// MST_SEAT_STATUS

				SQL = "UPDATE TBL_SEAT_STATUS SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG =  @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";

				let UPDATE_MST_SEAT_STATUS = await pool.request()
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.input("SEISAN_DATE", sql.DateTime2(0), SEISAN_DATE)
				.input("SEISAN_FLG", sql.Int, 1) //jsonUriageDtl.SEISAN_FLG
				.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
				.query(SQL);

				// TBL_CREDIT_RIREKI
				SQL = "UPDATE TBL_CREDIT_RIREKI SET SEISAN_FLG = @SEISAN_FLG, SEISAN_DATE = @SEISAN_DATE , UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";
				let UPDATE_TBL_CREDIT_RIREKI = await pool.request()
				.input("SEISAN_FLG", sql.Int, 1)
				.input("SEISAN_DATE", sql.DateTime2(0), SEISAN_DATE)
				.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.query(SQL);

				// MST_MEMBER
				SQL = "UPDATE MST_MEMBER SET LOGIN_CNT = LOGIN_CNT + 1, LAST_LOGIN_DATE = GETDATE(), APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN APP_LOGIN_CNT + 1 ELSE APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
				let UPDATE_MST_MEMBER = await pool.request()
				.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
				.input("APP_LOGIN_FLG", sql.Int, GET_TBL_URIAGE.APP_LOGIN_FLG)
				.query(SQL);
				// appMemberId
				if(GET_TBL_URIAGE.APP_LOGIN_FLG == 1) {
					SQL = "SELECT APP_MEMBER_ID FROM MST_MEMBER WHERE MEMBER_ID = @MEMBER_ID;";
					let GET_APP_MEMBER_ID = await pool.request()
					.input('MEMBER_ID',sql.VarChar,JSON_TBL_URIAGE.MEMBER_ID)
					.query(SQL);
					appMemberId = GET_APP_MEMBER_ID.recordset[0].APP_MEMBER_ID;
				}

				// DISCOUNT_YEN
				SQL = "SELECT * FROM TBL_URIAGE_DTL WHERE SALES_NO = @SALES_NO AND ITEM_KBN=@ITEM_KBN AND DELETE_FLG=0 ORDER BY TOTAL_YEN";
				let UPDATE_DISCOUNT_YEN = await pool.request()
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.input("ITEM_KBN", sql.Int, 5)
				.query(SQL);

				if(UPDATE_DISCOUNT_YEN.recordset.length > 0) {

					for(let i in UPDATE_DISCOUNT_YEN.recordset) {
						let iObj = UPDATE_DISCOUNT_YEN.recordset[i];

						if(totalDiscountYen < iObj.TOTAL_YEN) {
							discountYen = iObj.TOTAL_YEN;
							totalDiscountYen -= iObj.TOTAL_YEN;
						} else {
							discountYen = totalDiscountYen;
							totalDiscountYen = 0;
						}

						SQL = "UPDATE TBL_URIAGE_DTL SET TOTAL_YEN=TOTAL_YEN - @TOTAL_YEN, ITEM_PRICE = ITEM_PRICE - @TOTAL_YEN WHERE SALES_NO=@SALES_NO AND SEQ=@SEQ AND DELETE_FLG=0";
						let UPDATE_DISCOUNTED_YEN = await pool.request()
						.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
						.input("SEQ", sql.Int, iObj.SEQ)
						.input("TOTAL_YEN", sql.Int,discountYen)
						.query(SQL);

					}

				}
				let _UPDATE_TBL_GATE = await UPDATE_TBL_GATE(JSON_TBL_URIAGE.SEAT_NO,JSON_TBL_URIAGE.URIAGE_YEN,50000);
				// }

				// DELETE FROM TBL_URIAGE_DTL_TEMP

				// SQL = "DELETE FROM TBL_URIAGE_DTL_TEMP WHERE TOKEN_ID = @TOKEN_ID AND SALES_NO = @SALES_NO";
				// let DELETE_UDTL_TEMP = await pool.request()
				// .input('TOKEN_ID', sql.VarChar, reqParam.TOKEN_ID)
				// .input('SALES_NO', sql.VarChar, iSalesDataObj.SALES_NO)
				// .query(SQL);

				// _UPDATE_SEAT_STATUS = await UPDATE_SEAT_STATUS(reqParam.SEAT_NO,3,CNST_STAFF_ID);
	
				// if(GET_TOKEN_URIAGE_DTL_TEMP) {
	
				// } else {
				// 	ERROR_LOGGER(0,'No Record found in TBL_URIAGE_DTL_TEMP.');
				// 	closeConnection();
				// }
	
			}
			let seatStatus = 0;
			let { SEAT_NO } = reqParam.SALES_DATA[0].TBL_URIAGE;
			SQL = "SELECT * FROM TBL_URIAGE WHERE SEAT_NO = @SEAT_NO AND DELETE_FLG = 0 AND SEISAN_FLG = 0";
			let REMAINING_SALES  = await pool.request()
			.input('SEAT_NO', sql.VarChar, SEAT_NO)
			.query(SQL);
			if(REMAINING_SALES.recordset.length > 0) {
				if(PRICE_LIMIT_FLG) {
					seatStatus = 11;
				} else {
					seatStatus = 2;
				}
			} else {
				if(PRICE_LIMIT_FLG) {
					seatStatus = 11;
				} else {
					seatStatus = 2;
				}
			}
			_UPDATE_SEAT_STATUS = await UPDATE_SEAT_STATUS(SEAT_NO,seatStatus,CNST_STAFF_ID);
			// let UDS = await UPLOAD_DATA_SALES(uriageDtlObj.SALES_DATA);
			// console.log(UDS);
			// closeConnection();
		} catch (err) {
			console.log('SINGLE_SALES_NO\n'+err);
			sql.close();
			return res.status(404).send(CNST_ERROR_CODE.error_11);
		}
		
	}

	async function SINGLE_SALES_NO2(uriageDtlObj) {

		var success = false;
		var SQL = '';
		
		var totalDiscountYen = 0;
		var totalYen = 0;
		var discountYen = 0;
		
		var affectedRows = 0;

		var totalPrice = 0
		var SEQ = 0;

		var appMemberId = '';

		var seisanDate = uriageDtlObj.LOGOUT_DATE;

		try {
			
			const transaction = pool.transaction();

			transaction.begin(async err => {

				transaction.on('rollback', aborted => {
					sql.close();
					return res.status(200).send(CNST_ERROR_CODE.error_11);
				});
				transaction.on('commit', () => {
					sql.close();
					return res.status(200).send(CNST_ERROR_CODE.error_0);
				});

				for(let iSalesData in uriageDtlObj.SALES_DATA) {

					let iSalesDataObj = uriageDtlObj.SALES_DATA[iSalesData];

					let JSON_MST_SEAT = iSalesDataObj.MST_SEAT;
					let JSON_TBL_CREDIT_RIREKI = iSalesDataObj.TBL_CREDIT_RIREKI;
					let JSON_TBL_SEAT_STATUS = iSalesDataObj.TBL_SEAT_STATUS;
					let JSON_TBL_URIAGE = iSalesDataObj.TBL_URIAGE;
					let JSON_TBL_URIAGE_DTL = iSalesDataObj.TBL_URIAGE_DTL;
		
					let GET_TBL_URIAGE = await TBL_URIAGE(JSON_TBL_URIAGE.SEAT_NO,JSON_TBL_URIAGE.SALES_NO);
					GET_TBL_URIAGE = GET_TBL_URIAGE[0];

					// GET SEQ
					SEQ = await GET_MAX_SALES_SEQ(GET_TBL_URIAGE.SALES_NO);
					let _MST_SHOP = await MST_SHOP();
					let taxFlg = _MST_SHOP[0].TAX_FLG;
					
					SQL = "UPDATE TBL_URIAGE SET SEISAN_DATE = @SEISAN_DATE ,USE_MIN = @USE_MIN ,SHOUKEI_YEN = @SHOUKEI_YEN ,GOUKEI_YEN = @GOUKEI_YEN ,MAEUKE_YEN = @MAEUKE_YEN ,AZUKARI_YEN = @AZUKARI_YEN ,CHANGE_YEN = @CHANGE_YEN ,USE_POINT = @USE_POINT ,URIAGE_YEN = @URIAGE_YEN ,SEISAN_FLG = @SEISAN_FLG ,ADD_POINT = @ADD_POINT ,TAX_YEN = @TAX_YEN ,SEAT_NO = @SEAT_NO ,UPDATE_STAFF_ID = @UPDATE_STAFF_ID ,UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";
					transaction.request()
					.input('SALES_NO', sql.VarChar(12), JSON_TBL_URIAGE.SALES_NO)
					.input('SEISAN_DATE', sql.DateTime2(0), JSON_TBL_URIAGE.SEISAN_DATE)
					.input('USE_MIN', sql.Int, GET_TBL_URIAGE.USE_MIN)
					.input('SHOUKEI_YEN', sql.Int, JSON_TBL_URIAGE.SHOUKEI_YEN)
					.input('GOUKEI_YEN', sql.Int, JSON_TBL_URIAGE.GOUKEI_YEN)
					.input('MAEUKE_YEN', sql.Int, GET_TBL_URIAGE.MAEUKE_YEN)
					.input('AZUKARI_YEN', sql.Int, JSON_TBL_URIAGE.AZUKARI_YEN)
					.input('CHANGE_YEN', sql.Int, JSON_TBL_URIAGE.CHANGE_YEN)
					.input('USE_POINT', sql.Int, GET_TBL_URIAGE.USE_POINT)
					.input('URIAGE_YEN', sql.Int, JSON_TBL_URIAGE.URIAGE_YEN)
					.input('SEISAN_FLG', sql.TinyInt, JSON_TBL_URIAGE.SEISAN_FLG)
					.input('ADD_POINT', sql.Int, GET_TBL_URIAGE.ADD_POINT)
					.input('TAX_YEN', sql.Int, JSON_TBL_URIAGE.TAX_YEN)
					.input('SEAT_NO', sql.VarChar(4), JSON_TBL_URIAGE.SEAT_NO)
					.input('UPDATE_STAFF_ID', sql.VarChar(20), JSON_TBL_URIAGE.UPDATE_STAFF_ID)
					.query(SQL,async(err,result) => {
						if(err) return transaction.rollback();
						
						for(let i in JSON_TBL_URIAGE_DTL) {
							let jsonUriageDtl = JSON_TBL_URIAGE_DTL[i];
	
							let itemId = jsonUriageDtl.ITEM_ID;
							let itemNm = jsonUriageDtl.ITEM_NM;
	
							let UPDATE_TBL_URIAGE_DTL;
	
							if(jsonUriageDtl.ITEM_KBN == 0) {
								SQL = "UPDATE TBL_URIAGE_DTL SET ITEM_ID = @ITEM_ID, ITEM_NM = @ITEM_NM, ITEM_PRICE = @ITEM_PRICE, TOTAL_YEN = @TOTAL_YEN, SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_KBN = @ITEM_KBN AND SEQ = 0 AND DELETE_FLG = @DELETE_FLG;";
								UPDATE_TBL_URIAGE_DTL = transaction.request()
								.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
								.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
								.input('ITEM_NM', sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
								.input('ITEM_PRICE', sql.VarChar, jsonUriageDtl.ITEM_PRICE)
								.input('TOTAL_YEN', sql.VarChar, jsonUriageDtl.TOTAL_YEN)
								.input('BASE_MIN', sql.VarChar, jsonUriageDtl.BASE_MIN)
								.input('ITEM_KBN', sql.VarChar, jsonUriageDtl.ITEM_KBN)
								.input('SEISAN_DATE', sql.DateTime2(0), jsonUriageDtl.SEISAN_DATE)
								.input('SEISAN_FLG', sql.VarChar, jsonUriageDtl.SEISAN_FLG)
								.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
								.input('UPDATE_STAFF_ID', sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID);
							} else {
								SQL = "UPDATE TBL_URIAGE_DTL SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_ID = @ITEM_ID AND SEQ = @SEQ AND DELETE_FLG = @DELETE_FLG;";
								UPDATE_TBL_URIAGE_DTL = transaction.request()
								.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
								.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
								.input('SEQ', sql.VarChar, SEQ)
								.input('SEISAN_DATE', sql.DateTime2(0), jsonUriageDtl.SEISAN_DATE)
								.input('SEISAN_FLG', sql.VarChar, jsonUriageDtl.SEISAN_FLG)
								.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
								.input('UPDATE_STAFF_ID', sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID);
							}

							UPDATE_TBL_URIAGE_DTL.query(SQL,async(err,result) => {
								if(err) return transaction.rollback();

								if(result.rowsAffected[0] == 0) {
									SEQ++;
									SQL = "INSERT INTO TBL_URIAGE_DTL(SALES_NO, SEQ, ITEM_SEQ, ITEM_ID, ITEM_NM, ITEM_KBN, FOOD_KBN, TAX_KBN, ITEM_QU, ITEM_PRICE, BASE_MIN, TOTAL_YEN, SEISAN_DATE, SEISAN_FLG, MAEBARAI_FLG, DELETE_FLG, RETURN_QU, SEAT_USE_START_DATE, SEAT_NO, INPUT_STAFF_ID, INPUT_DATE, UPDATE_STAFF_ID, UPDATE_DATE) VALUES(@SALES_NO, @SEQ, @ITEM_SEQ, @ITEM_ID, @ITEM_NM, @ITEM_KBN, @FOOD_KBN, @TAX_KBN, @ITEM_QU, @ITEM_PRICE, @BASE_MIN, @TOTAL_YEN, @SEISAN_DATE, @SEISAN_FLG, @MAEBARAI_FLG, @DELETE_FLG, @RETURN_QU, @SEAT_USE_START_DATE, @SEAT_NO, @INPUT_STAFF_ID, GETDATE(), @UPDATE_STAFF_ID, GETDATE())";
									let INSERT_TBL_URIAGE_DTL = transaction.request()
									.input("SALES_NO", sql.VarChar, jsonUriageDtl.SALES_NO)
									.input("SEQ", sql.VarChar, SEQ)
									.input("ITEM_SEQ", sql.VarChar, jsonUriageDtl.ITEM_SEQ)
									.input("ITEM_ID", sql.VarChar, jsonUriageDtl.ITEM_ID)
									.input("ITEM_NM", sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
									.input("ITEM_KBN", sql.VarChar, jsonUriageDtl.ITEM_KBN)
									.input("FOOD_KBN", sql.VarChar, jsonUriageDtl.FOOD_KBN)
									.input("TAX_KBN", sql.VarChar, taxFlg)
									.input("ITEM_QU", sql.VarChar, jsonUriageDtl.ITEM_QU)
									.input("ITEM_PRICE", sql.VarChar, jsonUriageDtl.ITEM_PRICE)
									.input("TOTAL_YEN", sql.VarChar, jsonUriageDtl.TOTAL_YEN)
									.input("SEISAN_DATE", sql.DateTime2(0), jsonUriageDtl.SEISAN_DATE)
									.input("SEISAN_FLG", sql.VarChar, jsonUriageDtl.SEISAN_FLG)
									.input("MAEBARAI_FLG", sql.VarChar, jsonUriageDtl.MAEBARAI_FLG)
									.input("DELETE_FLG", sql.VarChar, jsonUriageDtl.DELETE_FLG)
									.input("RETURN_QU", sql.VarChar, jsonUriageDtl.RETURN_QU)
									// .input("SEAT_USE_START_DATE", sql.VarChar, (jsonUriageDtl.LOGIN_DATE == null)?null:convert_datetime(jsonUriageDtl.LOGIN_DATE))
									.input("SEAT_USE_START_DATE", sql.VarChar, null)
									.input("BASE_MIN", sql.VarChar, jsonUriageDtl.BASE_MIN)
									.input("SEAT_NO", sql.VarChar, jsonUriageDtl.SEAT_NO)
									.input("INPUT_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
									.input("UPDATE_STAFF_ID", sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
									.query(SQL,async(err,result) => {
										if(err) return transaction.rollback();

										if(jsonUriageDtl.ITEM_KBN == 5) {
											totalDiscountYen += jsonUriageDtl.TOTAL_YEN;
										} else {
											totalYen += jsonUriageDtl.TOTAL_YEN;
										}

										/* TBL VISITOR NOT INCLUDED */

										if(JSON_TBL_URIAGE.MEMBER_FLG == 1) {

											SQL = "UPDATE MST_MEMBER_SHOP SET MEMBER_SHOP_LOGIN_CNT = MEMBER_SHOP_LOGIN_CNT+1, MEMBER_SHOP_POINT += @MEMBER_SHOP_POINT, LAST_NYUTEN_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE(), MEMBER_SHOP_APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN MEMBER_SHOP_APP_LOGIN_CNT + 1 ELSE MEMBER_SHOP_APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
											let UPDATE_MST_MEMBER_SHOP = transaction.request()
											.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
											.input("MEMBER_SHOP_POINT", sql.VarChar, 0)
											.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID) 
											.input("APP_LOGIN_FLG", sql.VarChar, GET_TBL_URIAGE.APP_LOGIN_FLG)
											.query(SQL,async(err,result) => {
												if(err) return transaction.rollback();

												// MST_SEAT
												let UPDATE_MST_SEAT;
												let multiLogin = await MULTIPLE_LOGIN(JSON_TBL_URIAGE.SEAT_NO);
												if(multiLogin) {
													SQL = "UPDATE MST_SEAT SET LOGIN_CNT -= @LOGIN_CNT WHERE SEAT_NO = @SEAT_NO";
													UPDATE_MST_SEAT = transaction.request()
													.input('LOGIN_CNT', sql.Int, 1)
													.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
												} else {
													SQL = "UPDATE MST_SEAT SET LOGIN_CNT = 0, SEAT_USE_SEQ = ARG_SEAT_USE_SEQ+1, ARG_SEAT_USE_SEQ += 1 WHERE SEAT_NO = @SEAT_NO";
													UPDATE_MST_SEAT = transaction.request()
													.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
												}

												UPDATE_MST_SEAT.query(SQL,async(err,result) => {
													if(err) return transaction.rollback();

													// MST_SEAT_STATUS
													SQL = "UPDATE TBL_SEAT_STATUS SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG =  @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";

													let UPDATE_MST_SEAT_STATUS = transaction.request()
													.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
													.input("SEISAN_DATE", sql.DateTime2(0), jsonUriageDtl.SEISAN_DATE)
													.input("SEISAN_FLG", sql.Int, 1) //jsonUriageDtl.SEISAN_FLG
													.input("UPDATE_STAFF_ID", sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
													.query(SQL,async(err,result) => {
														if(err) return transaction.rollback();
														// TBL_CREDIT_RIREKI
														SQL = "UPDATE TBL_CREDIT_RIREKI SET SEISAN_FLG = @SEISAN_FLG, SEISAN_DATE = @SEISAN_DATE , UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";
														let UPDATE_TBL_CREDIT_RIREKI = transaction.request()
														.input("SEISAN_FLG", sql.Int, jsonUriageDtl.SEISAN_FLG)
														.input("SEISAN_DATE", sql.DateTime2(0), jsonUriageDtl.SEISAN_DATE)
														.input("UPDATE_STAFF_ID", sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
														.input("SALES_NO", sql.VarChar, jsonUriageDtl.SALES_NO)
														.query(SQL,async(err,result) => {
															if(err) return transaction.rollback();

															// MST_MEMBER
															SQL = "UPDATE MST_MEMBER SET LOGIN_CNT = LOGIN_CNT + 1, LAST_LOGIN_DATE = GETDATE(), APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN APP_LOGIN_CNT + 1 ELSE APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
															let UPDATE_MST_MEMBER = transaction.request()
															.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
															.input("APP_LOGIN_FLG", sql.Int, GET_TBL_URIAGE.APP_LOGIN_FLG)
															.query(SQL);
															// appMemberId
															if(GET_TBL_URIAGE.APP_LOGIN_FLG == 1) {
																SQL = "SELECT APP_MEMBER_ID FROM MST_MEMBER WHERE MEMBER_ID = @MEMBER_ID;";
																let GET_APP_MEMBER_ID = transaction.request()
																.input('MEMBER_ID',sql.VarChar,JSON_TBL_URIAGE.MEMBER_ID)
																.query(SQL);
																appMemberId = GET_APP_MEMBER_ID.recordset[0].APP_MEMBER_ID;
															}

															// DISCOUNT_YEN
															SQL = "SELECT * FROM TBL_URIAGE_DTL WHERE SALES_NO = @SALES_NO AND ITEM_KBN=@ITEM_KBN AND DELETE_FLG=0 ORDER BY TOTAL_YEN";
															let UPDATE_DISCOUNT_YEN = transaction.request()
															.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
															.input("ITEM_KBN", sql.Int, 5)
															.query(SQL);

															if(UPDATE_DISCOUNT_YEN.recordset.length > 0) {

																for(let i in UPDATE_DISCOUNT_YEN.recordset) {
																	let iObj = UPDATE_DISCOUNT_YEN.recordset[i];

																	if(totalDiscountYen < iObj.TOTAL_YEN) {
																		discountYen = iObj.TOTAL_YEN;
																		totalDiscountYen -= iObj.TOTAL_YEN;
																	} else {
																		discountYen = totalDiscountYen;
																		totalDiscountYen = 0;
																	}

																	SQL = "UPDATE TBL_URIAGE_DTL SET TOTAL_YEN=TOTAL_YEN - @TOTAL_YEN, ITEM_PRICE = ITEM_PRICE - @TOTAL_YEN WHERE SALES_NO=@SALES_NO AND SEQ=@SEQ AND DELETE_FLG=0";
																	let UPDATE_DISCOUNTED_YEN = transaction.request()
																	.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
																	.input("SEQ", sql.Int, iObj.SEQ)
																	.input("TOTAL_YEN", sql.Int,discountYen)
																	.query(SQL,async(err,result) => {
																		if(err) return transaction.rollback();

																		if(UPDATE_DISCOUNT_YEN.recordset.length == i) {
																			// transaction.commit();
																			console.log('COMMITTED');
																		}

																	});

																}

															}

														});

													});

												});

											});

										}

									});
								}

								// transaction.rollback();
							});
							// END TRANSACTION
	
						}

					});
		
				}

			});

		} catch (err) {
			ERROR_LOGGER(0,'SINGLE_SALES_NO2: '+err);
		}

	}

	async function MULTIPLE_SALES_NO(salesData,GassanSeq,PRICE_LIMIT_FLG) { // Gassan Log-out

		// console.log(salesData,GassanSeq,newMemberCnt);
		// return;

		let visitorcnt = 0;
		let SEQ = 0;
		let affectedRows = 0;
		let SQL = '';
		let CtrnewMemberCnt = 0;
		let totalYen = 0;

		let appMemberId = '';

		let discountYen = 0;
		let totalDiscountYen = 0;
		
		let totalPrice = 0
		// DiscountEx

		var seisanDate = dateTimeNow();
		// var seisanDate = uriageDtlObj.LOGOUT_DATE;
		// var seisanDate = '';

		try {

			for(let iSalesData in salesData.SALES_DATA) {

				let iSalesDataObj = salesData.SALES_DATA[iSalesData];

				let JSON_MST_SEAT = iSalesDataObj.MST_SEAT;
				let JSON_TBL_CREDIT_RIREKI = iSalesDataObj.TBL_CREDIT_RIREKI;
				let JSON_TBL_SEAT_STATUS = iSalesDataObj.TBL_SEAT_STATUS;
				let JSON_TBL_URIAGE = iSalesDataObj.TBL_URIAGE;
				let JSON_TBL_URIAGE_DTL = iSalesDataObj.TBL_URIAGE_DTL;
	
				let GET_TBL_URIAGE = await TBL_URIAGE(JSON_TBL_URIAGE.SEAT_NO,JSON_TBL_URIAGE.SALES_NO);
				GET_TBL_URIAGE = GET_TBL_URIAGE[0];

				// GET SEISAN_DATE
				// for(let i in JSON_TBL_URIAGE_DTL) {
				// 	if(JSON_TBL_URIAGE_DTL[i].SALES_NO == JSON_TBL_URIAGE.SALES_NO) {
				// 		seisanDate = JSON_TBL_URIAGE_DTL[i].SEISAN_DATE;
				// 		break;
				// 	}
				// }
	
				// GET_TBL_URIAGE_USE_MIN = await SEAT_ITEM_USE_MIN(GET_TBL_URIAGE.SALES_NO,seisanDate);
	
				// GET_TBL_URIAGE.USE_MIN = GET_TBL_URIAGE_USE_MIN;
	
				// console.log(GET_COMPUTE_TOTAL_YEN);
				// console.log(GET_TBL_URIAGE);
				totalDiscountYen = 0;
				totalYen = 0;

				JSON_TBL_URIAGE.GASSAN_SALES_SEQ = GassanSeq;
				JSON_TBL_URIAGE.USE_MIN = await SEAT_ITEM_USE_MIN(JSON_TBL_URIAGE.SALES_NO,seisanDate);
				CtrnewMemberCnt = (GET_TBL_URIAGE.NEW_MEMBER_FLG == 1)?CtrnewMemberCnt + 1: CtrnewMemberCnt;

				visitorcnt += 1;
				
				let UPDATE_TBL_URIAGE = await pool.request()
				.input('SALES_NO', sql.VarChar(12), JSON_TBL_URIAGE.SALES_NO)
				.input('SEISAN_DATE', sql.DateTime2(0), seisanDate)
				.input('USE_MIN', sql.Int, JSON_TBL_URIAGE.USE_MIN)
				.input('GOUKEI_YEN', sql.Int, JSON_TBL_URIAGE.GOUKEI_YEN)
				.input('AZUKARI_YEN', sql.Int, JSON_TBL_URIAGE.AZUKARI_YEN)
				.input('CHANGE_YEN', sql.Int, JSON_TBL_URIAGE.CHANGE_YEN)
				.input('URIAGE_YEN', sql.Int, JSON_TBL_URIAGE.URIAGE_YEN)
				.input('SEISAN_FLG', sql.Int, 1)
				.input('ADD_POINT', sql.Int, GET_TBL_URIAGE.ADD_POINT)
				.input('TAX_YEN', sql.Int, JSON_TBL_URIAGE.TAX_YEN)
				.input("GASSAN_SALES_NO", sql.VarChar(12), JSON_TBL_URIAGE.GASSAN_SALES_NO)
				.input("GASSAN_SALES_SEQ", sql.Int, JSON_TBL_URIAGE.GASSAN_SALES_SEQ)
				.input('SEAT_NO', sql.VarChar(4), JSON_TBL_URIAGE.SEAT_NO)
				.input('UPDATE_STAFF_ID', sql.VarChar(20), CNST_STAFF_ID)
				.query("UPDATE TBL_URIAGE SET SEISAN_DATE = @SEISAN_DATE ,USE_MIN = @USE_MIN  ,GOUKEI_YEN = @GOUKEI_YEN ,AZUKARI_YEN = @AZUKARI_YEN ,CHANGE_YEN = @CHANGE_YEN ,URIAGE_YEN = @URIAGE_YEN ,SEISAN_FLG = @SEISAN_FLG ,ADD_POINT = @ADD_POINT ,TAX_YEN = @TAX_YEN ,GASSAN_SALES_NO =  @GASSAN_SALES_NO , GASSAN_SALES_SEQ = @GASSAN_SALES_SEQ ,SEAT_NO = @SEAT_NO ,UPDATE_STAFF_ID = @UPDATE_STAFF_ID ,UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO");

				// GET SEQ
				SEQ = await GET_MAX_SALES_SEQ(JSON_TBL_URIAGE.SALES_NO);
				let _MST_SHOP = await MST_SHOP();
				let taxFlg = _MST_SHOP[0].TAX_FLG;
	
				// DATA FROM JSON TBL_URIAGE_DTL
				for(let i in JSON_TBL_URIAGE_DTL) {
					let jsonUriageDtl = JSON_TBL_URIAGE_DTL[i];

					let itemId = jsonUriageDtl.ITEM_ID;
					let itemNm = jsonUriageDtl.ITEM_NM;

					let UPDATE_TBL_URIAGE_DTL = '';

					if(jsonUriageDtl.ITEM_KBN == 0) {
						SQL = "UPDATE TBL_URIAGE_DTL SET ITEM_ID = @ITEM_ID, ITEM_NM = @ITEM_NM, ITEM_PRICE = @ITEM_PRICE, TOTAL_YEN = @TOTAL_YEN, SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_KBN = @ITEM_KBN AND SEQ = 0 AND DELETE_FLG = @DELETE_FLG";
						UPDATE_TBL_URIAGE_DTL = await pool.request()
						.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
						.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input('ITEM_NM', sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
						.input('ITEM_PRICE', sql.VarChar, jsonUriageDtl.ITEM_PRICE)
						.input('TOTAL_YEN', sql.VarChar, jsonUriageDtl.TOTAL_YEN)
						.input('BASE_MIN', sql.VarChar, jsonUriageDtl.BASE_MIN)
						.input('ITEM_KBN', sql.VarChar, jsonUriageDtl.ITEM_KBN)
						.input('SEISAN_DATE', sql.DateTime2(0), seisanDate)
						.input('SEISAN_FLG', sql.VarChar, 1)
						.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input('UPDATE_STAFF_ID', sql.VarChar, CNST_STAFF_ID)
						.query(SQL);
					} else {
						SQL = "UPDATE TBL_URIAGE_DTL SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG = @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO AND ITEM_ID = @ITEM_ID AND SEQ = @SEQ AND DELETE_FLG = @DELETE_FLG;";
						UPDATE_TBL_URIAGE_DTL = await pool.request()
						.input('SALES_NO', sql.VarChar, jsonUriageDtl.SALES_NO)
						.input('ITEM_ID', sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input('SEQ', sql.VarChar, jsonUriageDtl.SEQ)
						.input('SEISAN_DATE', sql.DateTime2(0), seisanDate)
						.input('SEISAN_FLG', sql.VarChar, 1)
						.input('DELETE_FLG', sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input('UPDATE_STAFF_ID', sql.VarChar, jsonUriageDtl.UPDATE_STAFF_ID)
						.query(SQL);
					}

					if(UPDATE_TBL_URIAGE_DTL.rowsAffected[0] == 0) {

						SEQ++;

						SQL = "INSERT INTO TBL_URIAGE_DTL(SALES_NO, SEQ, ITEM_SEQ, ITEM_ID, ITEM_NM, ITEM_KBN, FOOD_KBN, TAX_KBN, ITEM_QU, ITEM_PRICE, BASE_MIN, TOTAL_YEN, SEISAN_DATE, SEISAN_FLG, MAEBARAI_FLG, DELETE_FLG, RETURN_QU, SEAT_USE_START_DATE, SEAT_NO, INPUT_STAFF_ID, INPUT_DATE, UPDATE_STAFF_ID, UPDATE_DATE) VALUES(@SALES_NO, @SEQ, @ITEM_SEQ, @ITEM_ID, @ITEM_NM, @ITEM_KBN, @FOOD_KBN, @TAX_KBN, @ITEM_QU, @ITEM_PRICE, @BASE_MIN, @TOTAL_YEN, @SEISAN_DATE, @SEISAN_FLG, @MAEBARAI_FLG, @DELETE_FLG, @RETURN_QU, @SEAT_USE_START_DATE, @SEAT_NO, @INPUT_STAFF_ID, GETDATE(), @UPDATE_STAFF_ID, GETDATE())";
						let INSERT_TBL_URIAGE_DTL = await pool.request()
						.input("SALES_NO", sql.VarChar, jsonUriageDtl.SALES_NO)
						.input("SEQ", sql.VarChar, SEQ)
						.input("ITEM_SEQ", sql.VarChar, jsonUriageDtl.ITEM_SEQ)
						.input("ITEM_ID", sql.VarChar, jsonUriageDtl.ITEM_ID)
						.input("ITEM_NM", sql.NVarChar(120), jsonUriageDtl.ITEM_NM)
						.input("ITEM_KBN", sql.VarChar, jsonUriageDtl.ITEM_KBN)
						.input("FOOD_KBN", sql.VarChar, null)
						.input("TAX_KBN", sql.VarChar, taxFlg)
						.input("ITEM_QU", sql.VarChar, jsonUriageDtl.ITEM_QU)
						.input("ITEM_PRICE", sql.VarChar, jsonUriageDtl.ITEM_PRICE)
						.input("TOTAL_YEN", sql.VarChar, jsonUriageDtl.TOTAL_YEN)
						.input("SEISAN_DATE", sql.DateTime2(0), seisanDate)
						.input("SEISAN_FLG", sql.VarChar, 1)
						.input("MAEBARAI_FLG", sql.VarChar, 0)
						.input("DELETE_FLG", sql.VarChar, jsonUriageDtl.DELETE_FLG)
						.input("RETURN_QU", sql.VarChar, 0)
						// .input("SEAT_USE_START_DATE", sql.VarChar, (jsonUriageDtl.LOGIN_DATE == null)?null:convert_datetime(jsonUriageDtl.LOGIN_DATE))
						.input("SEAT_USE_START_DATE", sql.VarChar, null)
						.input("BASE_MIN", sql.VarChar, jsonUriageDtl.BASE_MIN)
						.input("SEAT_NO", sql.VarChar, jsonUriageDtl.SEAT_NO)
						.input("INPUT_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
						.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
						.query(SQL);
					}

					if(jsonUriageDtl.ITEM_KBN == 5) {
						totalDiscountYen += jsonUriageDtl.TOTAL_YEN;
					} else {
						totalYen += jsonUriageDtl.TOTAL_YEN;
					}

				}

				/* TBL VISITOR NOT INCLUDED */

				if(JSON_TBL_URIAGE.MEMBER_FLG == 1) {

					SQL = "UPDATE MST_MEMBER_SHOP SET MEMBER_SHOP_LOGIN_CNT = MEMBER_SHOP_LOGIN_CNT+1, MEMBER_SHOP_POINT += @MEMBER_SHOP_POINT, LAST_NYUTEN_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE(), MEMBER_SHOP_APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN MEMBER_SHOP_APP_LOGIN_CNT + 1 ELSE MEMBER_SHOP_APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
					let UPDATE_MST_MEMBER_SHOP = await pool.request()
					.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
					.input("MEMBER_SHOP_POINT", sql.VarChar, GET_TBL_URIAGE.ADD_POINT)
					.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
					.input("APP_LOGIN_FLG", sql.VarChar, GET_TBL_URIAGE.APP_LOGIN_FLG)
					.query(SQL);

				}

				// // MST_SEAT
				let UPDATE_MST_SEAT;
				let multiLogin = await MULTIPLE_LOGIN(JSON_TBL_URIAGE.SEAT_NO);
				if(multiLogin) {
					SQL = "UPDATE MST_SEAT SET LOGIN_CNT -= @LOGIN_CNT WHERE SEAT_NO = @SEAT_NO";
					UPDATE_MST_SEAT = await pool.request()
					.input('LOGIN_CNT', sql.Int, 1)
					.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
					.query(SQL);
				} else {
					SQL = "UPDATE MST_SEAT SET LOGIN_CNT = 0, SEAT_USE_SEQ = ARG_SEAT_USE_SEQ+1, ARG_SEAT_USE_SEQ += 1 WHERE SEAT_NO = @SEAT_NO";
					UPDATE_MST_SEAT = await pool.request()
					.input('SEAT_NO', sql.VarChar, JSON_TBL_URIAGE.SEAT_NO)
					.query(SQL);	
				}

				// MST_SEAT_STATUS

				SQL = "UPDATE TBL_SEAT_STATUS SET SEISAN_DATE = @SEISAN_DATE, SEISAN_FLG =  @SEISAN_FLG, UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";

				let UPDATE_MST_SEAT_STATUS = await pool.request()
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.input("SEISAN_DATE", sql.DateTime2(0), seisanDate)
				.input("SEISAN_FLG", sql.Int, 1)
				.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
				.query(SQL);

				// TBL_CREDIT_RIREKI
				SQL = "UPDATE TBL_CREDIT_RIREKI SET SEISAN_FLG = @SEISAN_FLG, SEISAN_DATE = @SEISAN_DATE , UPDATE_STAFF_ID = @UPDATE_STAFF_ID, UPDATE_DATE = GETDATE() WHERE SALES_NO = @SALES_NO";
				let UPDATE_TBL_CREDIT_RIREKI = await pool.request()
				.input("SEISAN_FLG", sql.Int, 1)
				.input("SEISAN_DATE", sql.DateTime2(0), seisanDate)
				.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.query(SQL);

				// MST_MEMBER

				SQL = "UPDATE MST_MEMBER SET LOGIN_CNT = LOGIN_CNT + 1, LAST_LOGIN_DATE = GETDATE(), APP_LOGIN_CNT = CASE WHEN @APP_LOGIN_FLG = 1 THEN APP_LOGIN_CNT + 1 ELSE APP_LOGIN_CNT END WHERE MEMBER_ID = @MEMBER_ID";
				let UPDATE_MST_MEMBER = await pool.request()
				.input("MEMBER_ID", sql.VarChar, JSON_TBL_URIAGE.MEMBER_ID)
				.input("APP_LOGIN_FLG", sql.Int, GET_TBL_URIAGE.APP_LOGIN_FLG)
				.query(SQL);

				GassanSeq++;

				// appMemberId
				if(GET_TBL_URIAGE.APP_LOGIN_FLG == 1) {
					SQL = "SELECT APP_MEMBER_ID FROM MST_MEMBER WHERE MEMBER_ID = @MEMBER_ID;";
					let GET_APP_MEMBER_ID = await pool.request()
					.input('MEMBER_ID',sql.VarChar,JSON_TBL_URIAGE.MEMBER_ID)
					.query(SQL);
					appMemberId = GET_APP_MEMBER_ID.recordset[0].APP_MEMBER_ID;
				}

				// DISCOUNT_YEN

				SQL = "SELECT * FROM TBL_URIAGE_DTL WHERE SALES_NO = @SALES_NO AND ITEM_KBN=@ITEM_KBN AND DELETE_FLG=0 ORDER BY TOTAL_YEN";
				let UPDATE_DISCOUNT_YEN = await pool.request()
				.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
				.input("ITEM_KBN", sql.Int, 5)
				.query(SQL);

				if(UPDATE_DISCOUNT_YEN.recordset.length > 0) {

					for(let i in UPDATE_DISCOUNT_YEN.recordset) {
						let iObj = UPDATE_DISCOUNT_YEN.recordset[i];

						if(totalDiscountYen < iObj.TOTAL_YEN) {
							discountYen = iObj.TOTAL_YEN;
							totalDiscountYen -= iObj.TOTAL_YEN;
						} else {
							discountYen = totalDiscountYen;
							totalDiscountYen = 0;
						}

						SQL = "UPDATE TBL_URIAGE_DTL SET TOTAL_YEN=TOTAL_YEN - @TOTAL_YEN, ITEM_PRICE = ITEM_PRICE - @TOTAL_YEN WHERE SALES_NO=@SALES_NO AND SEQ=@SEQ AND DELETE_FLG=0";
						let UPDATE_DISCOUNTED_YEN = await pool.request()
						.input("SALES_NO", sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
						.input("SEQ", sql.Int, iObj.SEQ)
						.input("TOTAL_YEN", sql.Int,discountYen)
						.query(SQL);

					}

				}
				let _UPDATE_TBL_GATE = await UPDATE_TBL_GATE(JSON_TBL_URIAGE.SEAT_NO,JSON_TBL_URIAGE.URIAGE_YEN,50000,iSalesData);
			}

			let seatStatus = 0;
			let { SEAT_NO } = reqParam.SALES_DATA[0].TBL_URIAGE;
			SQL = "SELECT * FROM TBL_URIAGE WHERE SEAT_NO = @SEAT_NO AND DELETE_FLG = 0 AND SEISAN_FLG = 0";
			let REMAINING_SALES  = await pool.request()
			.input('SEAT_NO', sql.VarChar, SEAT_NO)
			.query(SQL);
			if(REMAINING_SALES.recordset.length > 0) {
				if(PRICE_LIMIT_FLG) {
					seatStatus = 11;
				} else {
					seatStatus = 2;
				}
			} else {
				if(PRICE_LIMIT_FLG) {
					seatStatus = 11;
				} else {
					seatStatus = 2;
				}
			}
			_UPDATE_SEAT_STATUS = await UPDATE_SEAT_STATUS(SEAT_NO,seatStatus,CNST_STAFF_ID);
			// let UDS = await UPLOAD_DATA_SALES(salesData.SALES_DATA);
			// console.log(UDS);
			newMemberCnt = CtrnewMemberCnt;
		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'MULTIPLE_SALES_NO: '+err);
		}
		return visitorcnt;
	}

	async function UPLOAD_DATA_SALES(SALES_DATA) {

		let _MST_SHOP = await pool.request()
		.query("SELECT * FROM MST_SHOP");
		_MST_SHOP = _MST_SHOP.recordset[0];
		let uploadJson = {
			"username": "acrossadmin",
			"password": "xyz00zyx",
			"json":[]
		};
		for(let iSalesData in SALES_DATA) {

			let return_json = {};

			let iSalesDataObj = SALES_DATA[iSalesData];

			let JSON_MST_SEAT = iSalesDataObj.MST_SEAT;
			let JSON_TBL_CREDIT_RIREKI = iSalesDataObj.TBL_CREDIT_RIREKI;
			let JSON_TBL_SEAT_STATUS = iSalesDataObj.TBL_SEAT_STATUS;
			let JSON_TBL_URIAGE = iSalesDataObj.TBL_URIAGE;
			let JSON_TBL_URIAGE_DTL = iSalesDataObj.TBL_URIAGE_DTL;

			let HOLIDAY_FLG = await pool.request()
			.input('SALES_NO', sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
			.query("DECLARE @SEISAN_DATE datetime2(0), @LOGIN_DATE datetime2(0), @SHOP_START TIME(7), @SHOP_CLOSE TIME(7), @ADDDATE TINYINT SELECT @SEISAN_DATE = SEISAN_DATE, @LOGIN_DATE = LOGIN_DATE FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO SELECT @SHOP_START = SHOP_START, @SHOP_CLOSE = SHOP_CLOSE FROM MST_SHOP SELECT @ADDDATE = CASE WHEN @SHOP_CLOSE > @SHOP_START THEN 0 ELSE 1 END SELECT ( SELECT COUNT(*) AS HOLIDAY_FLG FROM MST_HOLIDAY WHERE CONVERT( DATETIME, CONVERT(VARCHAR(10), HOLIDAY_DATE) + ' ' + CONVERT(VARCHAR(8), @SHOP_START) ) <= @SEISAN_DATE AND CONVERT( DATETIME, CONVERT(VARCHAR(10), DATEADD(DAY, @ADDDATE, HOLIDAY_DATE)) + ' ' + CONVERT(VARCHAR(8), @SHOP_CLOSE) ) > @SEISAN_DATE AND HOLIDAY_KBN <> 9 ) AS SEISAN_HOLIDAY_FLG, ( SELECT COUNT(*) AS HOLIDAY_FLG FROM MST_HOLIDAY WHERE CONVERT( DATETIME, CONVERT(NVARCHAR(10), HOLIDAY_DATE) + ' ' + CONVERT(NVARCHAR(8), @SHOP_START) ) <= @LOGIN_DATE AND CONVERT( DATETIME, CONVERT(NVARCHAR(10), DATEADD(DAY, @ADDDATE, HOLIDAY_DATE)) + ' ' + CONVERT(NVARCHAR(8), @SHOP_CLOSE) ) > @LOGIN_DATE AND HOLIDAY_KBN <> 9 ) AS LOGIN_HOLIDAY_FLG");
			let LOGIN_HOLIDAY_FLG = HOLIDAY_FLG.recordset[0].LOGIN_HOLIDAY_FLG;
			let SEISAN_HOLIDAY_FLG = HOLIDAY_FLG.recordset[0].SEISAN_HOLIDAY_FLG;

			let TBL_URIAGE = await pool.request()
			.input('SALES_NO', sql.VarChar, JSON_TBL_URIAGE.SALES_NO)
			.query("SELECT * FROM TBL_URIAGE WHERE SALES_NO = @SALES_NO");
			for(let i in TBL_URIAGE.recordset[0]) {
				JSON_TBL_URIAGE[i] = TBL_URIAGE.recordset[0][i];
			}
			JSON_TBL_URIAGE.INPUT_DATE = (JSON_TBL_URIAGE.INPUT_DATE == null)?null:convert_datetime(JSON_TBL_URIAGE.INPUT_DATE);
			JSON_TBL_URIAGE.LOGIN_DATE = (JSON_TBL_URIAGE.LOGIN_DATE == null)?null:convert_datetime(JSON_TBL_URIAGE.LOGIN_DATE);
			JSON_TBL_URIAGE.SEISAN_DATE = (JSON_TBL_URIAGE.SEISAN_DATE == null)?null:convert_datetime(JSON_TBL_URIAGE.SEISAN_DATE);
			JSON_TBL_URIAGE.UPDATE_DATE = (JSON_TBL_URIAGE.UPDATE_DATE == null)?null:convert_datetime(JSON_TBL_URIAGE.UPDATE_DATE);

			return_json = {
				"SHOP_FC_NO": _MST_SHOP.SHOP_FC_NO,
				"SALES_NO": JSON_TBL_URIAGE.SALES_NO,
				"MEMBER_ID": JSON_TBL_URIAGE.MEMBER_ID,
				"LOGIN_DATE": JSON_TBL_URIAGE.LOGIN_DATE,
				"SEISAN_DATE": JSON_TBL_URIAGE.SEISAN_DATE,
				"USE_MIN": JSON_TBL_URIAGE.USE_MIN,
				"MEMBER_NM": JSON_TBL_URIAGE.MEMBER_NM,
				"MEMBER_YEARS_OLD": JSON_TBL_URIAGE.MEMBER_YEARS_OLD,
				"MEMBER_SEX": JSON_TBL_URIAGE.MEMBER_SEX,
				"MEMBER_FLG": JSON_TBL_URIAGE.MEMBER_FLG,
				"SMOKER_FLG": JSON_TBL_URIAGE.SMOKER_FLG,
				"RED_FLG": JSON_TBL_URIAGE.RED_FLG,
				"NYUTEN_CNT": JSON_TBL_URIAGE.NYUTEN_CNT,
				"SEAT_KBN": JSON_TBL_URIAGE.SEAT_KBN,
				"SEAT_BUNRUI": JSON_TBL_URIAGE.SEAT_BUNRUI,
				"TOTAL_BASE_MIN": JSON_TBL_URIAGE.TOTAL_BASE_MIN,
				"PACK_END_TIME": JSON_TBL_URIAGE.PACK_END_TIME,
				"SHOUKEI_YEN": JSON_TBL_URIAGE.SHOUKEI_YEN,
				"GOUKEI_YEN": JSON_TBL_URIAGE.GOUKEI_YEN,
				"MAEUKE_YEN": JSON_TBL_URIAGE.MAEUKE_YEN,
				"AZUKARI_YEN": JSON_TBL_URIAGE.AZUKARI_YEN,
				"CHANGE_YEN": JSON_TBL_URIAGE.CHANGE_YEN,
				"USE_POINT_YEN": JSON_TBL_URIAGE.USE_POINT_YEN,
				"URIAGE_YEN": JSON_TBL_URIAGE.URIAGE_YEN,
				"URIAGE_KBN": JSON_TBL_URIAGE.URIAGE_KBN,
				"GASSAN_SALES_NO": JSON_TBL_URIAGE.GASSAN_SALES_NO,
				"GASSAN_SALES_SEQ": JSON_TBL_URIAGE.GASSAN_SALES_SEQ,
				"SEISAN_FLG": JSON_TBL_URIAGE.SEISAN_FLG,
				"CLOSE_FLG": JSON_TBL_URIAGE.CLOSE_FLG,
				"CLOSE_DATE": JSON_TBL_URIAGE.CLOSE_DATE,
				"DELETE_FLG": JSON_TBL_URIAGE.DELETE_FLG,
				"ADD_POINT": JSON_TBL_URIAGE.ADD_POINT,
				"TAX_YEN": JSON_TBL_URIAGE.TAX_YEN,
				"TAX_KBN": JSON_TBL_URIAGE.TAX_KBN,
				"USE_POINT": JSON_TBL_URIAGE.USE_POINT,
				"MEMBER_LEVEL": JSON_TBL_URIAGE.MEMBER_LEVEL,
				"SEAT_NO": JSON_TBL_URIAGE.SEAT_NO,
				"INPUT_STAFF_ID": JSON_TBL_URIAGE.INPUT_STAFF_ID,
				"INPUT_DATE": JSON_TBL_URIAGE.INPUT_DATE,
				"UPDATE_STAFF_ID": CNST_STAFF_ID,
				"UPDATE_DATE": JSON_TBL_URIAGE.UPDATE_DATE,
				"NEW_MEMBER_FLG": JSON_TBL_URIAGE.NEW_MEMBER_FLG,
				"APP_LOGIN_FLG": JSON_TBL_URIAGE.APP_LOGIN_FLG,
				"LOGIN_HOLIDAY_FLG": LOGIN_HOLIDAY_FLG,
				"SEISAN_HOLIDAY_FLG": SEISAN_HOLIDAY_FLG,
				"TBL_URIAGE_DTL": await TBL_URIAGE_DTL(JSON_TBL_URIAGE_DTL,SEISAN_HOLIDAY_FLG,_MST_SHOP.SHOP_FC_NO),
				"TBL_SEAT_STATUS": await TBL_SEAT_STATUS(JSON_TBL_SEAT_STATUS,LOGIN_HOLIDAY_FLG,SEISAN_HOLIDAY_FLG,_MST_SHOP.SHOP_FC_NO),
				"TBL_VISITOR": null,
				"TBL_CREDIT_RIREKI": null,
				"MST_SEAT": null,
				"TBL_GASSAN": null
				// "TBL_CREDIT_RIREKI": (JSON_TBL_CREDIT_RIREKI == null)?null:await TBL_CREDIT_RIREKI(JSON_TBL_CREDIT_RIREKI,LOGIN_HOLIDAY_FLG,SEISAN_HOLIDAY_FLG),
				// "MST_SEAT": (JSON_MST_SEAT == null)?null:await MST_SEAT(JSON_MST_SEAT,LOGIN_HOLIDAY_FLG,SEISAN_HOLIDAY_FLG,JSON_TBL_URIAGE.SEAT_NO),
				// "TBL_GASSAN": (reqParam.TBL_GASSAN == null)?null:await TBL_GASSAN(reqParam.TBL_GASSAN,LOGIN_HOLIDAY_FLG,SEISAN_HOLIDAY_FLG,JSON_TBL_URIAGE.SEAT_NO)
			};
			uploadJson.json.push(return_json);
		}
		let uploadSales = await UPLOAD_SALES(uploadJson,(result) => {
			console.log(result);
			return result;
		});
	}

	async function UPDATE_SEAT_STATUS(seatNo,seatStatus,staffId) {
		let SQL = '';
		let result;
		try {
			SQL = "UPDATE MST_SEAT SET SEAT_STATUS = @SEAT_STATUS, UPDATE_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID WHERE SEAT_NO = @SEAT_NO";
			let UPDATE_MST_SEAT = await pool.request()
			.input("SEAT_STATUS", sql.Int, seatStatus)
			.input("SEAT_NO", sql.VarChar, seatNo)
			.input("UPDATE_STAFF_ID", sql.VarChar, staffId)
			.query(SQL);
		} catch(err) {
			console.log('UPDATE_SEAT_STATUS\n',err);
			sql.close();
			return res.status(400).send(ERROR_LOGGER.error_11);
		}
		
	}

	async function UPDATE_TBL_GATE(seatNo,uriageYen,poolPrice,SEQ) {
		let SQL = "";
		const SEISAN_DATE = dateTimeNow();
		try{
			let flg = () => {
				return {
					OPEN_FLG: (uriageYen >= poolPrice)?1:0,
					PRICE_LIMIT_FLG: (uriageYen >= poolPrice)?1:0
				};
			};

			// const pool = await sql.connect(config);
			const transaction = pool.transaction();

			transaction.begin(err => {

				transaction.on('rollback',async aborted => {
					console.log('UPDATE_TBL_GATE rolledback\n');
					sql.close();
					return res.status(500).json(CNST_ERROR_CODE.error_5);
				});

				transaction.on('commit',async (err,result) => {
					// sql.close();
					return;
					// return res.status(200).json(CNST_ERROR_CODE.error_0);
				});

				SQL = "UPDATE TBL_GATE SET OPEN_FLG = @OPEN_FLG , LOGIN_FLG = @LOGIN_FLG, PRICE_LIMIT_FLG = @PRICE_LIMIT_FLG, SEISAN_DATE = @SEISAN_DATE WHERE SEAT_NO = @SEAT_NO AND SEQ = @SEQ";
				transaction.request()
				.input("SEAT_NO",sql.VarChar,seatNo)
				.input("SEISAN_DATE",sql.DateTime2(0),SEISAN_DATE)
				.input("OPEN_FLG",sql.Int,flg().OPEN_FLG)
				.input("LOGIN_FLG",sql.Int,1)
				.input("PRICE_LIMIT_FLG",sql.Int,flg().PRICE_LIMIT_FLG)
				.input('SEQ', sql.Int, SEQ)
				.query(SQL,async(err,result) => {
					if(err) return transaction.rollback();
					transaction.commit();
				});

			});

		} catch(err) {
			console.log('UPDATE_TBL_GATE\n',err);
			sql.close();
			return res.status(400).json(CNST_ERROR_CODE.error_11);
		}
	}

	async function MULTIPLE_LOGIN(seatNo) {
		let multiple = false;
		let SQL = '';
		let result;

		try {
			SQL = "SELECT * FROM TBL_URIAGE WHERE SEAT_NO = @SEAT_NO AND SEISAN_FLG = @SEISAN_FLG AND DELETE_FLG = @DELETE_FLG";
			result = await pool.request()
			.input("SEAT_NO", seatNo)
			.input("SEISAN_FLG", 0)
			.input("DELETE_FLG", 0)
			.query(SQL);
			if(result.recordset.length > 0) {
				multiple = true;
			}
		} catch(err) {
			ERROR_LOGGER(0,'MULTIPLE_LOGIN: '+err);
		}
		return multiple;
	}

	async function GET_MAX_SALES_SEQ(salesNo) {
		let result = null;
		let MAX_SEQ = 0;
		let SQL = "SELECT ISNULL(MAX(SEQ),0) AS MAX_SEQ FROM TBL_URIAGE_DTL WHERE SALES_NO = @SALES_NO";

		try {

			result = await pool.request()
			.input('SALES_NO', sql.VarChar, salesNo)
			.query(SQL);

			if(result.recordset.length > 0) {
				return result.recordset[0].MAX_SEQ;
			} else {
				ERROR_LOGGER(0,'(api-paid)GET_MAX_SALES_SEQ: no match found');
			}

		} catch(err) {
			ERROR_LOGGER(0,'GET_MAX_SALES_SEQ: '+err);
		}

	}

	async function TBL_URIAGE(SEAT_NO,SALES_NO) {
		try{
			let result = await pool.request()
			.input('SEAT_NO', sql.Int, SEAT_NO)
			.input('SALES_NO', sql.Int, SALES_NO)
			.query("SELECT * FROM [TBL_URIAGE] AS [TBL_URIAGE] WHERE [SALES_NO] = @SALES_NO AND [TBL_URIAGE].[SEAT_NO] = @SEAT_NO AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
			if(result.recordset.length > 0) {
				return result.recordset;
			} else {
				console.log('TBL_URIAGE: No data found');
				sql.close();
				return res.status(404).send(CNST_ERROR_CODE.error_2);
			}
		} catch(err) {
			console.log('TBL_URIAGE\n'+err);
			sql.close();
			return res.status(404).send(CNST_ERROR_CODE.error_11);
		}
		
	}

	async function SEAT_ITEM_USE_MIN(salesNo,seisanDate) {
		let min = 0;
		let SQL = '';
		let result = null;

		try{

			SQL = "SELECT OCCUPIED_TIME = DATEDIFF(MINUTE, LOGIN_DATE, @END_DATE) FROM TBL_SEAT_STATUS WHERE SALES_NO = @SALES_NO AND DELETE_FLG = @DELETE_FLG AND SEISAN_FLG = @SEISAN_FLG";

			result = await pool.request()
			.input('SALES_NO', sql.NVarChar, salesNo)
			.input('END_DATE', sql.NVarChar, seisanDate)
			.input('DELETE_FLG', sql.TinyInt, 0)
			.input('SEISAN_FLG', sql.TinyInt, 0)
			.query(SQL);

			if(result.recordset.length > 0) {
				min = result.recordset[0].OCCUPIED_TIME;
			}
			
		} catch(err) {
			ERROR_LOGGER(0,'SEAT_ITEM_USE_MIN: '+err);
		}
		return min;
	}

	async function TOKEN_URIAGE_DTL_TEMP(tokenId,salesNo) {
		try {

			let result = await pool.request()
			.input('TOKEN_ID', sql.VarChar(50), tokenId)
			.input('SALES_NO', sql.VarChar(50), salesNo)
			.query("SELECT * FROM TBL_URIAGE_DTL_TEMP WHERE SALES_NO = @SALES_NO AND TOKEN_ID = @TOKEN_ID;");
			
			if(result.recordset.length > 0) {
				return result.recordset;
			} else {
				return false;
			}
		} catch(err) {
			ERROR_LOGGER(0,'TOKEN_URIAGE_DTL_TEMP: '+err);
		}
		
	}

	async function COMPUTE_TOTAL_YEN(temp_uriage_dtl,tbluriage) {

		let taxRate = 0;
		let syoukeiYen = 0;
		let tSyoukeiYen = 0;
		let TaxYen = 0;
		let DiscountYen = 0;
		let TDiscountYen = 0;
		let CreditYen = 0;
		let MaebaraiYen = 0;
		let TMaebaraiYen = 0;
		let TotalYen = 0;
		let TTotalYen = 0;
		let ZanSeisanYen = 0;
		let ChangeYen = 0;
		let UsePoint = 0;
		let AddPoint = 0;
		let TTaxYen = 0;

		let TDiscountAccess = 0;
		let TotalCreditYenTemp = 0;

		try {

			taxRate = await TAX_RATE();

			DiscountYen = 0;
			SyoukeiYen = 0;
			MaebaraiYen = 0;
			TaxYen = 0;
			TotalYen = 0;

			// compute all temp_uriage_dtl

			for(let i in temp_uriage_dtl) {
				let obj = temp_uriage_dtl[i];
				if(obj.ITEM_KBN != 5) {
					syoukeiYen += obj.TOTAL_YEN;
				} else {
					DiscountYen += obj.TOTAL_YEN;
				}
				
			}

			MaebaraiYen = tbluriage.MAEUKE_YEN;

			//Tax Yen
			// TaxYen = Common.CalcTaxPrice(TaxRate, SyoukeiYen, Shop.TAX_FLG);

			let _MST_SHOP = await MST_SHOP();

			// Tax Yen
			TaxYen = await CALC_TAX_PRICE(taxRate,syoukeiYen,_MST_SHOP[0].TAX_FLG);

			// Total Yen
			if(_MST_SHOP[0].TAX_FLG == 0) {
				TotalYen = syoukeiYen + DiscountYen;
			} else {
				TotalYen = syoukeiYen + TaxYen + DiscountYen;
			}

			TotalYen = (TotalYen < 0) ? 0 : TotalYen;

			tbluriage.SHOUKEI_YEN = syoukeiYen;
			tbluriage.GOUKEI_YEN = TotalYen;
			tbluriage.URIAGE_YEN = TotalYen;
			tbluriage.TAX_KBN = _MST_SHOP[0].TAX_FLG;
			tbluriage.TAX_YEN = TaxYen;

			// TMaebaraiYen += MaebaraiYen;
			// TSyoukeiYen += SyoukeiYen;
			// TDiscountYen += DiscountYen;
			// TTotalYen += TotalYen;
			// TTaxYen += TaxYen;

			TMaebaraiYen = MaebaraiYen;
			tSyoukeiYen = syoukeiYen;
			TDiscountYen = DiscountYen;
			TTotalYen = TotalYen;
			TTaxYen = TaxYen;

			if(DiscountYen * -1 > syoukeiYen) {
				TDiscountAccess = (DiscountYen * -1) - syoukeiYen;
			}

			ZanSeisanYen = TTotalYen - CreditYen - TMaebaraiYen - tbluriage.USE_POINT;
			ZanSeisanYen = (ZanSeisanYen < 0) ? 0 : ZanSeisanYen;

			let returnObj = {
				SyoukeiYen:tSyoukeiYen,
				TaxYen:TTaxYen,
				DiscountYen:TDiscountYen,
				CreditYen:CreditYen,
				MaebaraiYen:TMaebaraiYen,

				ZanSeisanYen:ZanSeisanYen - TDiscountAccess,
				UsePoint:tbluriage.USE_POINT,
				ChangeYen:(ChangeYen < 0) ? 0 : ChangeYen,
				AddPoint:AddPoint
			};

			// TotalCreditYenTemp = Convert.ToInt32(lblCreditYen.Value);
			return returnObj;
		} catch(err) {
			ERROR_LOGGER(0,'COMPUTE_TOTAL_YEN: '+err);
		}

	}

	async function TAX_RATE(taxDate = null) {
		let rtval = 0;
		let SQL = '';
		let where_val = '';
		let result;
		try{
			
			if(taxDate != null) {
				taxDate = dateTimeNow();
				result = await pool.request()
				.input('TAXDATE', sql.Date, taxDate)
				.query("SELECT TOP 1 ISNULL(TAX_RATE,0) AS TAX_RATE FROM MST_TAX WHERE START_DATE < CONVERT(char(8), @TAXDATE ,112) ORDER BY START_DATE DESC;")
			} else {
				result = await pool.request()
				.query("SELECT TOP 1 ISNULL(TAX_RATE,0) AS TAX_RATE FROM MST_TAX WHERE START_DATE < CONVERT(char(8), GETDATE() ,112) ORDER BY START_DATE DESC;")
			}
			if(result.recordset.length > 0) {
				rtval = result.recordset[0].TAX_RATE;
			} else {
				return false;
			}
			
		} catch(err) {
			ERROR_LOGGER(0,'TAX_RATE: '+err);
		}
		return rtval;
	}

	async function MST_SHOP() {
		try {
			let result = await pool.request()
			.query("SELECT * FROM MST_SHOP;");
			if(result.recordset.length > 0) {
				return result.recordset;
			} else {
				return false;
			}
		} catch(err) {
			ERROR_LOGGER(0,'MST_SHOP: '+err);
		}
	}

	async function CALC_TAX_PRICE(taxRate,price,taxKbn) {

		let result = 0;

		try {

			if(taxKbn == 0) {
				result = Math.floor(price / (100 + taxRate) * taxRate);
			}

		} catch(err) {
			ERROR_LOGGER(0,'CALC_TAX_PRICE: '+err);
		}
		return result;
	}

	async function POST_APP_MEMBER(appMemberId) {
		let postType = 1;
		const cnst = {
			APP_SEARCH_MEMBER:0,
			APP_SEARCH_COUPON:0,
			APP_MEMBER_SHOP_VERIFY:1,
			APP_UPDATE_MEMBER_LOGIN_CNT:2,
			APP_UPDATE_MEMBER_DELETE_FLG:3,
			APP_UPDATE_MEMBER:4,
			APP_UPDATE_MST_MEMBER:5,
			APP_CNST_RESPONSE_SUCCESS:1,
			APP_CNST_RESPONSE_FAILED:2
		};

		let success = false;
		let SQL = '';
		let JSON_MST_MEMBER = {};

		try {
			// let MST_MEMBER = await pool.request()
			// .query("SELECT * FROM MST_MEMBER");

			SQL = "SELECT * FROM MST_MEMBER WHERE APP_MEMBER_ID = @APP_MEMBER_ID";
			let MST_MEMBER = await pool.request()
			.input('APP_MEMBER_ID', sql.VarChar, appMemberId)
			.query(SQL);

			if(query.recordset.length > 0) {
				
				return query.recordset[0];

			}

			// switch(postType) {
			// 	case cnst.APP_MEMBER_SHOP_VERIFY:

					

			// 		break;
			// 	default:
			// 		throw 'DEFAULT switch.';
			// 		break;
			// }

		} catch(err) {
			ERROR_LOGGER(CNST_ERROR_CODE.error_11,'POST_APP_MEMBER\n'+err);
		}

		return success;

	}

	async function closeConnection() {
    	return await sql.close();
    }

	async function ERROR_LOGGER(code,name) {
		console.log(name);
		sql.close();
		return res.status(400).send(code);
	}

});
//#endregion API-PAID

//#region API-COUPON_SEARCH
app.post('/api/coupon_search', async (req,res) => {

	const request = require('request');

	try{

		let postRules = ['COUPON_ID','SHOP_FC_NO'];

		for(let i in postRules) {
			let rule = postRules[i];

			if(!req.body[rule]) {
				// res.json(2);
				ERROR_LOGGER(CNST_ERROR_CODE.error_3,'VERIFICATION ERROR\n');
				return;
			}
		}

		const {COUPON_ID,SHOP_FC_NO} = req.body;
		let postData = {
			"apikey": "cc03e747a6afbbcbf8be7668acfebee5",
			"coupon_id": COUPON_ID,
			"shop_fc_no": SHOP_FC_NO
		};
	
		const request_opt = {
			method: 'post',
			body: postData,
			json: true,
			url: 'http://coupon.across-web.net/api/v2/machine/coupon_search'
		};
	
		request(request_opt,(err, httpResponse, body) => {
			if(err) ERROR_LOGGER(CNST_ERROR_CODE.error_1,'VERIFICATION ERROR\n');
			if(body.code == 1) {
				let data = body.coupon;
		
				return_json = {
					"COUPON_ID":data.item_id,
					"COUPON_NM":data.item_nm,
					"PRICE_TYPE":data.price_flg,
					"ITEM_KBN":data.coupon_kbn
				};
				if(data.price_flg == 1) {
					return_json['COUPON_PRICE'] = data.item_yen;
				} else{
					return_json['COUPON_DISCOUNT'] = data.item_yen;
				}
				sql.close();
				return res.status(200).json(return_json);
			} else {
				sql.close();
				return res.status(404).json(CNST_ERROR_CODE.error_4);
			}
		});

	} catch(err) {
		ERROR_LOGGER(CNST_ERROR_CODE.error_1,'API-COUPON_SEARCH:\n'+err);
	}

	async function ERROR_LOGGER(code,name) {
		let return_error = '';
		console.log(name);
		return_error = code;
		sql.close();
		return res.status(404).send(return_error);
	}

});

app.post('/api/cancel', async (req,res) => {

	let SQL = '';

	try {

		let rules = {
			seat_no:'Required Seat no'
		};

		postValidation(rules,req.body)
		.then(async result => {

			let pool = await sql.connect(config);

			const transaction = pool.transaction();

			transaction.begin(async err => {

				let rolledBack = false;

				transaction.on('rollback', aborted => {
					console.log('API-CANCEL: Rolled back\n');
					sql.close();
					return res.status(200).json(CNST_ERROR_CODE.error_11);
				});
				transaction.on('commit', () => {
					console.log('API-CANCEL: Success request\n');
					sql.close();
					return res.status(200).json(CNST_ERROR_CODE.error_0);
				});

				// SQL = "UPDATE TBL_URIAGE_DTL_TEMP SET SEQ = @SEQ WHERE SALES_NO = @SALES_NO;";
				// transaction.request()
				// .input("SEQ", sql.Int, (Math.random() * 50))
				// .input("SALES_NO", sql.Int,43)
				// .query(SQL,async(err,result) => {
				// 	if(err) return transaction.rollback();
				// 	transaction.commit();
				// });

				SQL = "UPDATE MST_SEAT SET SEAT_STATUS = @SEAT_STATUS, UPDATE_DATE = GETDATE(), UPDATE_STAFF_ID = @UPDATE_STAFF_ID WHERE SEAT_NO = @SEAT_NO";
				transaction.request()
				.input("SEAT_STATUS", sql.Int, 1)
				.input("SEAT_NO", sql.VarChar, req.body.seat_no)
				.input("UPDATE_STAFF_ID", sql.VarChar, CNST_STAFF_ID)
				.query(SQL,async(err,result) => {
					if(err) return transaction.rollback();
					if(result.rowsAffected[0] !== 0) {
						transaction.commit();
					} else {
						console.log('API-CANCEL: Update failed\n');
						sql.close();
						return res.status(200).json(CNST_ERROR_CODE.error_2);
					}
				});

			});

		})
		.catch(err => {
			console.log('API-CANCEL: Validation Error\n');
			sql.close();
			return res.status(200).json(CNST_ERROR_CODE.error_2);
		});

	} catch(err) {
		console.log('API-CANCEL: \n',err);
		sql.close();
		return res.status(200).json(CNST_ERROR_CODE.error_11);
	}

});

app.post('/testrollback', async (req,res) => {

	let SQL = '';

	try {

		let pool = await sql.connect(config);
		let reqParam = req.body;

		SQL = "UPDATE TBL_URIAGE SET SEISAN_FLG = 0, SEISAN_DATE = NULL WHERE SALES_NO =@SALES_NO UPDATE TBL_URIAGE_DTL SET SEISAN_FLG = 0, SEISAN_DATE = NULL WHERE SALES_NO =@SALES_NO DELETE TBL_URIAGE_DTL where sales_no=@SALES_NO and item_kbn <> 0 UPDATE TBL_SEAT_STATUS SET SEISAN_FLG = 0, SEISAN_DATE = NULL WHERE SALES_NO =@SALES_NO UPDATE MST_SEAT SET SEAT_USE_SEQ= @SEAT_USE_SEQ, LOGIN_CNT = @LOGIN_CNT WHERE SEAT_NO = @SEAT_NO";
		let rollBack = await pool.request()
		.input('SALES_NO', sql.NVarChar, reqParam.SALES_NO)
		.input('SEAT_USE_SEQ', sql.Int, reqParam.SEAT_USE_SEQ)
		.input('LOGIN_CNT', sql.Int, reqParam.LOGIN_CNT)
		.input('SEAT_NO', sql.NVarChar, reqParam.SEAT_NO)
		.query(SQL);

		console.log(rollBack);

	} catch(err) {
		console.log(err);
		sql.close();
		return res.status(400).send(CNST_ERROR_CODE.error_11);
	}

});


//#endregion API-COUPON_SEARCH

function postValidation(rules,postData) {
	
	return new Promise((resolve,reject) => {
	// 	if(typeof rules === 'object' && typeof postData === 'object') {
		for(let iRules in rules) {
			if(!postData[iRules]) {
				reject(rules[iRules]);
				break;
			}
		}
		resolve();
	// 	}
	});
}

function convert_datetime(datetime) {
	return datetime.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

function getDateTimeToString(string_datetime) {
	let string_datetime_date = string_datetime.getFullYear()+'-'+((string_datetime.getMonth()+1) < 10 ? '0'+(string_datetime.getMonth()+1):(string_datetime.getMonth()+1))+'-'+(string_datetime.getDate() < 10 ?'0'+string_datetime.getDate():string_datetime.getDate());
	let string_datetime_time = (string_datetime.getHours()<10?'0'+string_datetime.getHours():string_datetime.getHours())+':'+(string_datetime.getMinutes()<10?'0'+string_datetime.getMinutes():string_datetime.getMinutes())+':'+(string_datetime.getSeconds()<10?'0'+string_datetime.getSeconds():string_datetime.getSeconds());
	return string_datetime_date+' '+string_datetime_time;
}

function _getDate() {
	let today = new Date();
	let dd = today.getDate();
	let mm = today.getMonth()+1; 
	let yyyy = today.getFullYear();
	if(dd < 10) {
		dd = '0'+dd;
	}
	if(mm < 10) {
		mm = '0'+mm;
	}
	return yyyy+'-'+dd+'-'+mm;
}

function dateTimeNow() {
	try{
		var today = new Date();
		return getDateTimeToString(today);
	} catch(err) {
		console.log('dateTimeNow: '+err);
		return;
	}
}

function MONITOR_LOG(status, logMsg, data, res, connection = false) {
	console.log(logMsg);
	if(connection) sql.close();
	return res.status(status).json(data);
}

app.listen(3001, () => console.log('Example app listening on port 3001!'));