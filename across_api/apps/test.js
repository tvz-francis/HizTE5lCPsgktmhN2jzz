const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const sql = require('mssql');
// const mysql = require('mysql');
const dateFormat = require('dateformat');
// const querystring = require('querystring');
// var each = require('foreach');

app.use(bodyParser.json());

let logger = function(req,res,next) {
	if(req.method != 'POST') res.end();
	req.requestTime = Date.now();
	next();
};

app.use(logger);

var config = {
    user:'sa',
	password:'xyz0',
	server:'192.168.128.121\\sqlexpress',
	// database:'POS-_-00141-_-4_04'
	// database:'POS-_-00242-_-04_11'
	database:'POS-_-99997-_-5_2'
	// database:'POS'
	// dateStrings: true
};

// var connection = new sql.ConnectionPool({
// 	user:'sa',
// 	password:'xyz0',
// 	server:'192.168.128.121\\sqlexpress',
// 	database:'POS-_-00141-_-4_04'
// });

app.post('/api/sales', async (req, res) => {
	closeConnection();
	let return_json = {};
	let return_error = {};
	let pool = await sql.connect(config);

	let param = req.body;
	let rules = {
		'username':'user',
		'password':'pass',
		'seat_no':'seat'
	};
	let error = 0;

	for(let i in rules) {
		if(!req.body[i]) {
			return_json.response = 'ERROR: '+i;
			return res.json(return_json);
		}
	}

	// POST DATE / END DATE
	let SEISAN_DATE = dateTimeNow();
	// let SEISAN_DATE = '2018-04-27 12:57:53';

	let username = param.username;
	let password = param.password;
	let seat_no = param.seat_no;
	let items = [];
	return_json.POSTED_DATE = SEISAN_DATE;
	return_json.SALES_DATA = [];
	return_json.ALL_TOTAL = 0; // await GET_ALL_TOTAL()
	return_json.ALL_TAX = 0; //await GET_ALL_TAX(await TAX_RATE(_getDate));
	let member_flg = '';
	let getSEQ = 0;

	let _uriage = '';
	let autoPackClass = [];
	let uriageDtlToToken = [];
	let total_price = 0;

	let MST_SHOP = await pool.request()
        .query("SELECT * FROM MST_SHOP;");
        MST_SHOP = MST_SHOP.recordset[0];
        MST_SHOP.SHOP_EX_FREE = (MST_SHOP.SHOP_EX_FREE * 60);
        SEISAN_DATE = new Date(SEISAN_DATE);
        SEISAN_DATE = new Date(SEISAN_DATE.setSeconds(SEISAN_DATE.getSeconds()-(MST_SHOP.SHOP_EX_FREE)));
        SEISAN_DATE = getDateTimeToString(SEISAN_DATE);

	try {
		let result1 = await pool.request()
        .input('seatno', sql.Int, seat_no)
        .query("SELECT * FROM [TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");

	    if(result1.recordset.length > 0) {
	    	for(var i in result1.recordset) {
		    	var obj = result1.recordset[i];
		    	member_flg = obj.MEMBER_FLG;
		    	_uriage = obj;
		    	let GETEXT_AUTOPACK_HT = await GET_EXT_AUTOPACK_HT(await TBL_URIAGE_DTL(obj.SALES_NO),obj);
		        return_json.SALES_DATA.push({
			    	"SEAT_INFO":{
			    		"SEAT_NO" : obj.SEAT_NO,
			    		"SALES_NO" : obj.SALES_NO,
			    		"MEMBER_ID" : obj.MEMBER_ID,
			    		"MEMBER_NM" : obj.MEMBER_NM,
			    		"LOGIN_DATE" : convert_datetime(obj.LOGIN_DATE),
			    		// "LOGOUT_DATE" : obj.SEISAN_DATE
			    	},
			    	"SALES_DTL":{
			    		"TBL_URIAGE":{
			    			"TAX_YEN" : await compute_TAX_YEN(total_price),//obj.TAX_YEN
			    			"DEPOSIT_RECIEVED" : obj.MAEUKE_YEN
			    		},
			    		"TBL_URIAGE_DTL": GETEXT_AUTOPACK_HT
			    		// 
			    	},
			    	//"EXT_CURRENT": await ExCurrentDate(await TBL_URIAGE_DTL(obj.SALES_NO))//await GET_EXTCURRENT(await TBL_URIAGE_DTL(obj.SALES_NO))
			    });
			   
		    }

		    return_json.ALL_TOTAL = total_price;
		    return_json.ALL_TAX = await compute_TAX_YEN(total_price);
	    } else {

	    	return_error.error = 1;
    		res.json(return_error);
    		closeConnection();
    		return;
	    }
	    
	} catch(err) {
		sendError(0,'get tbl uriage: '+err);
		// return err;
	}

	async function uriageDtlClass(obj) {

		console.log(obj);

	}

	async function ExCurrentDate(data,edp,uriageDtl,uriage) { // Compute Extension

		let exItemQu = 0;
		let exItemPrice = 0;
		let itemSequence = 0;
		let exItemMin = 0;

		let endDate = SEISAN_DATE;
		let index = 0;

		// MAKE TOKEN AND ADD
		
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

					console.log(exItemMin);

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
						// getSEQ = (getSEQ == '')?0:getSEQ;
						// console.log(getSEQ);
						//let exItemNameFix = (getSEQ == 0)?data[0].ITEM_NM:data[0].ITEM_NM+'('+getSEQ+')';
						let exItemNameFix = (getSEQ == 0)?obj.EX_ITEM_NM:obj.EX_ITEM_NM+'('+getSEQ+')';

						console.log(exItemNameFix);

						uriageDtlToToken.push({
							'SALES_NO':uriage.SALES_NO,
							// 'SEQ':itemSequence,
							'SEAT_NO':uriage.SEAT_NO,
							'ITEM_SEQ':getSEQ,
							'ITEM_ID':obj.EX_ITEM_ID,//uriageDtl.ITEM_ID,
							'ITEM_NM':exItemNameFix,
							'ITEM_KBN':1,
							'TAX_KBN':MST_SHOP.TAX_FLG,
							'BASE_MIN':obj.EX_BASE_MIN,
							'ITEM_QU':exItemQu,

							'ITEM_PRICE':exItemPrice,
							'TOTAL_YEN':(exItemPrice * exItemQu), //  + uriageDtl.ITEM_PRICE
							'SEAT_USE_START_DATE':exCurrentDate
							// then add
						});
						itemSequence++;

						// dito na ko. lilito pa sa process

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
		// console.log(exItemId,weekFlg,hrFlg,uriageMemberFlg);

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
	        	// Price = MemberFlg == Var.CNST_MEMBER_FLG_YES ? Convert.ToInt32(reader["MEMBER_PRICE"].ToString()) : Convert.ToInt32(reader["VISITOR_PRICE"].ToString());
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
					// MaxDate = EndDate;
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
	    			// case 7:
	        		// 	weekflag = 8;
	        		// 	break;
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

	// check for EXT, AUTOPACK=
	async function GET_EXT_AUTOPACK_HT(data,uriage) {
		let _data = data;
		let _ExCurrentDate;
		let TBL_URIAGE_DTL_CLASS = [];
		try	{
			let item = [];
			for(let i in _data) {
				let obj = _data[i];

				// ITEM_KBN > 1 (display but not compute)
				if(obj.ITEM_KBN > 1) {
					TBL_URIAGE_DTL_CLASS.push({
			        	SALES_NO:obj.SALES_NO,
			        	ITEM_ID:obj.ITEM_ID,
			        	ITEM_KBN:obj.ITEM_KBN,
			        	ITEM_NM:obj.ITEM_NM,
			        	PRICE:obj.ITEM_PRICE,
			        	QU:obj.ITEM_QU,
						TOTAL:obj.TOTAL_YEN,
						WHERE:'BEFORE EXT_AP'
			        });
			        total_price += obj.TOTAL_YEN;
				}

				let query = await pool.request()
		        .input('salesno', sql.Int, obj.SALES_NO)
		        .input('itemid', sql.VarChar, obj.ITEM_ID)
		        .query("SELECT D.SEAT_USE_START_DATE, D.ITEM_ID, D.ITEM_NM, S.CHANGE_PRICE_FLG, S.BASE_MIN AS SEAT_BASE_MIN, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN, CONVERT(varChar,S.PACK_END_TIME) AS PACK_END_TIME, AUTO_PACK_ID, D.ITEM_SEQ FROM TBL_URIAGE_DTL D INNER JOIN MST_SEAT_ITEM S ON D.ITEM_ID = S.ITEM_ID INNER JOIN MST_EX_SEAT_ITEM E ON S.EX_ITEM_ID = E.ITEM_ID WHERE S.SEQ = 0 AND E.SEQ = 0 AND D.SALES_NO = @salesno AND D.ITEM_ID = @itemid AND D.DELETE_FLG = '0';");

		        for(let i2 in query.recordset) {
		        	let obj2 = query.recordset[i2];
		        	if(obj2.AUTO_PACK_ID != null) {
						let autoPack = await AUTO_PACK(obj2.ITEM_ID,obj2.SEAT_USE_START_DATE,SEISAN_DATE,_uriage.MEMBER_FLG,obj2.ITEM_SEQ);
							TBL_URIAGE_DTL_CLASS.push({
					        	SALES_NO:obj.SALES_NO,
					        	ITEM_ID:autoPack.ITEM_ID,
					        	ITEM_KBN:obj.ITEM_KBN,
					        	ITEM_NM:autoPack.ITEM_NM,
					        	PRICE:autoPack.ITEM_PRICE,
					        	QU:1,
								TOTAL:autoPack.TOTAL_YEN,
								WHERE:'AFTER AP'
					        });
					        total_price += obj.TOTAL_YEN;

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
							SALES_NO:obj.SALES_NO,
							ITEM_ID:obj2.ITEM_ID,
							ITEM_KBN:obj.ITEM_KBN,
							ITEM_NM:obj2.ITEM_NM,
							PRICE:obj.ITEM_PRICE,
							QU:1,
							TOTAL:obj.ITEM_PRICE,
							WHERE:'AP NULL'
						});
						total_price += obj.TOTAL_YEN;
					}

					let _GET_SEAT_ITEM_END_DATE = await GET_SEAT_ITEM_END_DATE([obj2]);
					// make token
					// console.log([obj2],_GET_SEAT_ITEM_END_DATE,obj,uriage);
			        _ExCurrentDate = await ExCurrentDate([obj2],_GET_SEAT_ITEM_END_DATE,obj,uriage);
			        for(let ex in _ExCurrentDate) {
						let exobj = _ExCurrentDate[ex];
						
			        	TBL_URIAGE_DTL_CLASS.push({
				        	SALES_NO:exobj.SALES_NO,
				        	ITEM_ID:exobj.ITEM_ID,
				        	ITEM_KBN:exobj.ITEM_KBN,
				        	ITEM_NM:exobj.ITEM_NM,
				        	PRICE:exobj.ITEM_PRICE,
				        	QU:exobj.ITEM_QU,
							TOTAL:exobj.TOTAL_YEN,
							WHERE:'AFTER EXT'
				        });
				        total_price += exobj.TOTAL_YEN;
			        }
		        }
			}

		} catch(err) {
			sendError(0,'GET_EXT_AUTOPACK_HT: '+err);
		}
		// CHECK SEAT BASE MIN, EX_BASE_MIN, PACK_END_TIME, AUTO_PACK_ID
		return TBL_URIAGE_DTL_CLASS;
	}

	async function AUTO_PACK(itemId,seatUseStartDate,seatUseEndDate,uriageMemberFlg,itemSeq,useCount = 1) {
		// console.log(itemId,seatUseStartDate,seatUseEndDate,uriageMemberFlg,itemSeq,useCount);
		// console.log('itemId: '+itemId,'seatUseStartDate: '+seatUseStartDate,'seatUseEndDate: '+seatUseEndDate,'uriageMemberFlg: '+uriageMemberFlg,'itemSeq: '+itemSeq,'useCount: '+useCount);

		// let _seatUseStartDate = new Date(seatUseStartDate);
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

			SQL = 'SELECT '+
			'TOP 1 I.ITEM_ID, '+
			'I.ITEM_NM,'+
			'I.BASE_MIN AS SEAT_BASE_MIN, '+
			'CASE '+
				'WHEN P.MEMBER_PRICE IS NULL '+
				'THEN I.MEMBER_PRICE '+
				'ELSE P.MEMBER_PRICE '+
				'END AS MEMBER_PRICE, '+
			'CASE '+
				'WHEN P.VISITOR_PRICE IS NULL '+
				'THEN I.VISITOR_PRICE '+
				'ELSE P.VISITOR_PRICE '+
				'END AS VISITOR_PRICE, '+
				'I.PACK_END_TIME, '+
				'I.AUTO_PACK_ID, '+
				'I.EX_ITEM_ID, '+
				'E.ITEM_NM AS EX_ITEM_NM, '+
				'E.BASE_MIN AS EX_BASE_MIN '+
			'FROM '+
				'MST_SEAT_ITEM I '+
			'INNER JOIN MST_EX_SEAT_ITEM E '+
				'ON E.ITEM_ID = I.EX_ITEM_ID '+
			'LEFT JOIN '+
				'(SELECT '+
				'P.ITEM_ID, '+
				'P.SEQ, '+
				'P.MEMBER_PRICE, '+
				'P.VISITOR_PRICE '+
				'FROM '+
				'MST_SEAT_ITEM P '+
				'WHERE ( '+
				'P.START_CHANGE_TIME <= CONVERT(VARCHAR (5), GETDATE (), 8) '+
				'AND P.END_CHANGE_TIME >= CONVERT(VARCHAR (5), GETDATE (), 8) '+
				') AND WEEK_FLG = @WEEK_FLG) P '+
				'ON I.ITEM_ID = P.ITEM_ID '+
			'WHERE I.ITEM_ID = @ITEM_ID '+
			'AND I.SEQ = @SEQ;';

			// region Virtual Extension Calculation
			let query = await pool.request()
	        .input('SEQ', sql.VarChar, itemSeq)//itemSeq
			.input('ITEM_ID', sql.VarChar, itemId)
			.input('WEEK_FLG', sql.VarChar, weekFlg)
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

	        let data = [];//SEAT_USE_START_DATE,PACK_END_TIME,AUTO_PACK_ID,ITEM_SEQ,SEAT_BASE_MIN
	        data.push({
	        	SEAT_USE_START_DATE:seatUseStartDate,
	        	PACK_END_TIME:PackEndTime,
	        	AUTO_PACK_ID:AutoPackId,
	        	ITEM_SEQ:itemSeq,
	        	SEAT_BASE_MIN:itemBaseMin
	        });

	        let exCurrentDate = (PackEndTime == '')?getDateTimeToString(new Date(seatUseStartDate.setSeconds(seatUseStartDate.getSeconds()+60))):await GET_SEAT_ITEM_END_DATE(data);

	        totalYen = itemPrice + (await CALC_EXPRICE_VIRTUAL(seatUseStartDate,seatUseEndDate,uriageMemberFlg,itemBaseMin,exItemId,ExBaseMin,PackEndTime,useCount));

	        //region AUTO PACK

	        let SQL_PACK_A = "IF EXISTS( SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ) SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ELSE SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN";

	        let SQL_PACK_B = "IF EXISTS( SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN DESC ) SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN DESC ELSE SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, S.MEMBER_PRICE, S.VISITOR_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN <= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( (S.PACK_USE_START_TIME < @ENDDATE OR S.PACK_END_TIME > @ENDDATE) OR S.PACK_END_TIME IS NULL ) AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN DESC";

	        let getEndDate = seatUseEndDate.split(' ')[1];
	        let getHmm = getEndDate.split(':');
	        

	        let query_SQL_PACK_A = await pool.request()
	        .input('AUTO_PACK_ID', sql.VarChar, AutoPackId)
	        .input('USEMIN', sql.VarChar, useMin)
	        .input('ENDDATE', sql.VarChar, getHmm[0]+':'+getHmm[1])
	        .input('WEEK_FLG', sql.VarChar,weekFlg)
	        .query(SQL_PACK_A);

	        if(query_SQL_PACK_A.recordset.length > 0) {

	        	for(let i in query_SQL_PACK_A.recordset) {
	        		let obj = query_SQL_PACK_A.recordset[i];

	        		if(uriageMemberFlg == 1) {
		        		totalYen = obj.MEMBER_PRICE;
		        	} else {
		        		totalYen = obj.VISITOR_PRICE;
		        	}
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
	        .query(SQL_PACK_B);

	        if(query_SQL_PACK_B.recordset.length > 0) {

	        	for(let i in query_SQL_PACK_B.recordset) {
	        		let obj = query_SQL_PACK_B.recordset[i];

	        		if(uriageMemberFlg == 1) {
		        		totalYen = obj.MEMBER_PRICE;
		        	} else {
		        		totalYen = obj.VISITOR_PRICE;
		        	}
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
			sendError(0,'AUTO_PACK: '+err);
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

			let data = [];//SEAT_USE_START_DATE,PACK_END_TIME,AUTO_PACK_ID,ITEM_SEQ,SEAT_BASE_MIN
	        data.push({
	        	SEAT_USE_START_DATE:seatUseStartDate,
	        	PACK_END_TIME:packEndTime,
	        	// AUTO_PACK_ID:null,
	        	// ITEM_SEQ:itemSeq,
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

	async function CHECK_AUTO_PACK() {

	}

	async function GET_ALL_TOTAL() {
		try{
			let query = await pool.request()
	        .input('seatno', sql.Int, seat_no)
	        .query("SELECT SUM([TBL_URIAGE].[URIAGE_YEN]) AS [ALL_TOTAL] FROM [POS-_-00141-_-4_04].[dbo].[TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
	        return query.recordset[0].ALL_TOTAL;
		} catch(err) {
			sendError(0,'get all total');
			// return err;
		}
	    // "ALL_TOTAL":SUM of ALL TBL_URIAGE.TOTAL in All Sales Data,

	}

	async function GET_ALL_TAX(tax_rate) {
		try{
			let query = await pool.request()
	        .input('seatno', sql.Int, seat_no)
	        .query("SELECT SUM([TBL_URIAGE].[URIAGE_YEN]) AS [ALL_TOTAL] FROM [POS-_-00141-_-4_04].[dbo].[TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
	        // return query.recordset[0].ALL_TOTAL;
	        return return_json.ALL_TOTAL * (tax_rate / (100 + await TAX_RATE(_getDate)));
		} catch(err) {
			sendError(0,'get all tax');
			// return err;
		}
	}

	async function TAX_RATE(date) {
		try{
			let query = await pool.request()
	        .query("SELECT TOP(1) CONVERT(char(10), [MST_TAX].[START_DATE],120) AS [START_DATE], [TAX_RATE] FROM [POS-_-00141-_-4_04].[dbo].[MST_TAX] AS [MST_TAX] ORDER BY [START_DATE] DESC;");
	        let data = query.recordset[0];
	        if(date <= data.START_DATE) {
		    	result = data.TAX_RATE;
		    } else {
		    	result = 0;
		    }
		    return result;
		} catch(err) {
			sendError(0,'tax rate');
			// return err;
		}
	}

    async function compute_TAX_YEN(price) {
    	// console.log(price);
    	// total = price * qu
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
	    	sendError(0,'compute tax yen');
			// return err;
	    }
    }

    async function TBL_URIAGE_DTL(SALES_NO) {

    	try {
    		let result2 = await pool.request()
		    .input('salesno', sql.Int, SALES_NO)
		    .query("SELECT * FROM [TBL_URIAGE_DTL] AS [TBL_URIAGE_DTL] WHERE [TBL_URIAGE_DTL].[SALES_NO] = @salesno;");
		    return result2.recordset;
    	} catch(err) {
    		sendError(0,'get tbl uriage dtl');
			// return err;
    	}

    }

    async function closeConnection() {
    	return await sql.close();
    }

    async function sendError(code,name) {
    	return_error.error = code;
    	console.log(name);
    	res.json(return_error);
    	return;
    }

    res.json(return_json);
    closeConnection();

});

// :gassan_sales_no([0-9]{12})
app.post('/api/gassan_sales_no', async (req,res) => {
	let return_json = {};

	try {

		let pool = await sql.connect(config);

		let MST_SHOP_query = "SELECT [ARG_GASSAN_SALES_NO] FROM [MST_SHOP];";
		MST_SHOP_query = await pool.request()
		.query(MST_SHOP_query);

		if(MST_SHOP_query.recordset.length > 0) {
			MST_SHOP_query = MST_SHOP_query.recordset[0];

			MST_SHOP_query.ARG_GASSAN_SALES_NO = (parseInt(MST_SHOP_query.ARG_GASSAN_SALES_NO) + 1);

			return_json.GASSAN_SALES_NO = padding(MST_SHOP_query.ARG_GASSAN_SALES_NO,12,'0');

			res.json(return_json);
		} else {
			res.json(return_json.response = 0);
		}

	} catch(err) {
		sendError(0,'gassan_sales_no: '+err);
	}

	function padding(target,num,padded) {
		try{
			let _pad = padded;
			for(let i = 0; i < num; i++) {
				if(_pad.concat(target).length == num) {
					return _pad.concat(target);
				}
				_pad = _pad.concat(padded);
			}

		} catch(err) {
			sendError(0,'padding: '+err);
		}
	}

	closeConnection();

	async function closeConnection() {
    	return await sql.close();
    }

	async function sendError(code,name) {
    	return_error.error = code;
    	console.log(name);
    	res.json(return_error);
    	return;
    }
	
});

app.post('/api/init', async (req,res) => {
	let return_json = {};
	const CNST_STAFF_ID = "00000629au05";
	const CNST_SEAT_ITEM_ID = "999920176262";
	const BASE_MIN = 120;

	try {
		let pool = await sql.connect(config);

		let MST_SHOP = "SELECT * FROM MST_SHOP;";
		MST_SHOP = await pool.request()
		.query(MST_SHOP);

		if(MST_SHOP.recordset.length == 0)  {
			res.json(0);
			return;
		}

		MST_SHOP = MST_SHOP.recordset[0];

		let MST_TAX = "SELECT TOP 1 [START_DATE], [TAX_RATE] FROM  [MST_TAX]  ORDER BY [START_DATE] DESC;";
		MST_TAX = await pool.request()
		.query(MST_TAX);

		if(MST_TAX.recordset.length == 0)  {
			res.json(0);
			return;
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
				"STAFF_NM" : "自動精算"
			}
		};

		return_json = mstShopDetails;

		res.json(return_json);
		

	} catch(err) {
		sendError(0,'init: '+err,res);
	}

});

app.post('/api/deposit', async (req,res) => {
	let return_json = {};

	try {

		let pool = await sql.connect(config);

		let postDataRules = {
			"SALES_NO":"000000000000", 
			"MEMBER_ID":"000000000000",
			"DEPOSIT_AMOUNT":2000,
			"AWAY_TIME":"2018-04-10 14:00:00"
		}

		for(let i in postDataRules) {
			if(req.body[i] === 'undefined' || req.body[i] == '') {
				return_json = '2';
				res.status(200).send(return_json);
				return;
			}
		}

		let SALES_NO = req.body.SALES_NO;
		let MEMBER_ID = req.body.MEMBER_ID;
		let DEPOSIT_AMOUNT = req.body.DEPOSIT_AMOUNT;
		let AWAY_TIME = req.body.AWAY_TIME;

		let UPDATE_TBL_URIAGE = "UPDATE [TBL_URIAGE] SET MAEUKE_YEN = @DEPOSIT_AMOUNT WHERE [SALES_NO] = '000000000016' AND [MEMBER_ID] = '002420002215';";
		UPDATE_TBL_URIAGE = await pool.request()
		.input('DEPOSIT_AMOUNT', sql.Int,DEPOSIT_AMOUNT)
		.query(UPDATE_TBL_URIAGE);

		return_json = '1';
		res.status(200).send(return_json);

		sql.close();
		res.end();

	} catch(err) {
		sendError(0,'deposit: '+err,res);
	}

});

app.post('/api/paid', async (req,res) => {

	let success = false;
	// let SQL = '';
	let totalDiscountYen = 0;
	let totalYen = 0;
	let discountYen = 0;
	
	let affectedRows = 0;

	let totalPrice = 0
	let SEQ = 0;

	// function appMemberId() {

	// }

	// function selectedSalesNo() {

	// }

	// function logoutReceipt() {
		
	// }

	

	try {

		let pool = await sql.connect(config);



	} catch(err) {
		sendError(0,'paid: '+err,res);
	}


});

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

function sendError(code,name,res) {
	let return_error = {}

	return_error.error = code;
	console.log(name);
	res.json(return_error);
	return;
}

app.listen(3000, () => console.log('Example app listening on port 3000!'));