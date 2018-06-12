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

app.post('/api/sales2', async(req,res) => {
  const pool = await sql.connect(config);
  let rules = { 'seat_no':'Required Seat no' };

  let SEISAN_DATE = dateTimeNow();

  postValidation(rules,req.body)
  .then(async() => {
    
    let SQL = '';
    let seat_no = req.body.seat_no;
    let uriage = [];
    let uriageDtl = [];

    let TBL_URIAGE = await pool.request()
    .input('seatno', sql.VarChar, seat_no)
    .query("SELECT * FROM [TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");
    if(TBL_URIAGE.recordset.length === 0) {
      sql.close();
      res.status(200).send(error.type_2);
    }
    uriage = TBL_URIAGE.recordset;

    for(let i in uriage) {
      let tblUriageDtl = await TBL_URIAGE_DTL(uriage[i].SALES_NO);
      for(let uriageDtlItem in tblUriageDtl) {
        uriageDtl.push(tblUriageDtl[uriageDtlItem]);
      }
    }

    //#region COMPUTE SALES
    let _COMPUTE_EXT_AP = await COMPUTE_EXT_AP(uriage, uriageDtl);
    //#endregion COMPUTE SALES

    res.end();
  })
  .catch(err => {
    console.log(err);
    sql.close();
    res.status(200).send(error.type_11);
  });

  async function TBL_URIAGE_DTL(SALES_NO) {
    try {
      let result = await pool.request()
      .input('salesno', sql.Int, SALES_NO)
      .query("SELECT * FROM [TBL_URIAGE_DTL] AS [TBL_URIAGE_DTL] WHERE [TBL_URIAGE_DTL].[SALES_NO] = @salesno;");
      if(result.recordset.length > 0) {
        return result.recordset;
      } else {
        throw new TypeError('No record on TBL_URIAGE_DTL');
      }
    } catch(err) {
      console.log(err);
      sql.close();
      res.status(200).send(error.type_11);
    }
  }

  async function COMPUTE_EXT_AP(uriage, uriageDtl) {
    let SEQ = 0;
    try {

      uriage.forEach(_uriage => {
        uriageDtl.forEach(async _uriageDtl => {
          if(_uriage.SALES_NO === _uriageDtl.SALES_NO) {
            if(_uriageDtl.ITEM_KBN < 2) {
              let query = await pool.request()
              .input('salesno', sql.Int, _uriageDtl.SALES_NO)
              .input('itemid', sql.VarChar, _uriageDtl.ITEM_ID)
              .query("SELECT D.SEAT_USE_START_DATE, D.ITEM_ID, D.ITEM_NM, S.CHANGE_PRICE_FLG, S.BASE_MIN AS SEAT_BASE_MIN, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN, CONVERT(varChar,S.PACK_END_TIME) AS PACK_END_TIME, AUTO_PACK_ID, D.ITEM_SEQ FROM TBL_URIAGE_DTL D INNER JOIN MST_SEAT_ITEM S ON D.ITEM_ID = S.ITEM_ID INNER JOIN MST_EX_SEAT_ITEM E ON S.EX_ITEM_ID = E.ITEM_ID WHERE S.SEQ = 0 AND E.SEQ = 0 AND D.SALES_NO = @salesno AND D.ITEM_ID = @itemid AND D.DELETE_FLG = '0';");
              query.recordset.forEach(async element => {
                if(element.AUTO_PACK_ID != null) {
                  let autoPack = await AUTO_PACK(element.ITEM_ID,convert_datetime(element.SEAT_USE_START_DATE),SEISAN_DATE,_uriage.MEMBER_FLG,element.ITEM_SEQ);
                }
              });

            }
          }
        });
      });
      
    } catch(err) {
      console.log(err);
      sql.close();
      res.status(200).send(error.type_11);
    }
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

			let SQL_PACK_A = "IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN ) BEGIN CREATE TABLE #TMP_SEAT_ITEM_10 ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_10 SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN CREATE TABLE #TMP_SEAT_ITEM_WEEK ( ITEM_ID VARCHAR(12), ITEM_NM VARCHAR(120), SEQ INT, ITEM_PRICE INT, BASE_MIN SMALLINT, PACK_END_TIME TIME(0), EX_ITEM_ID VARCHAR(12), EX_ITEM_NM VARCHAR(120), EX_BASE_MIN SMALLINT ) INSERT INTO #TMP_SEAT_ITEM_WEEK SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN SELECT * FROM #TMP_SEAT_ITEM_WEEK A UNION SELECT * FROM #TMP_SEAT_ITEM_10 B WHERE B.ITEM_ID NOT IN (SELECT A.ITEM_ID FROM #TMP_SEAT_ITEM_WEEK A) ORDER BY ITEM_PRICE DROP TABLE #TMP_SEAT_ITEM_10 DROP TABLE #TMP_SEAT_ITEM_WEEK DROP TABLE #TMP_SEAT_ITEM_10 DROP TABLE #TMP_SEAT_ITEM_WEEK END ELSE IF EXISTS( SELECT TOP 1 S.ITEM_ID FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ) SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND ( ( S.START_CHANGE_TIME <= @ENDDATE AND CONVERT(TIME, DATEADD(MINUTE, - 1, S.END_CHANGE_TIME)) >= @ENDDATE ) OR ( ISNULL(S.START_CHANGE_TIME, '') = '' AND ISNULL(s.END_CHANGE_TIME, '') = '' ) ) AND S.WEEK_FLG = @WEEK_FLG ORDER BY S.BASE_MIN ELSE SELECT TOP 1 S.ITEM_ID, S.ITEM_NM, S.SEQ, CASE WHEN @MEMBER_FLG = 1 THEN S.MEMBER_PRICE ELSE S.VISITOR_PRICE END AS ITEM_PRICE, S.BASE_MIN, S.PACK_END_TIME, S.EX_ITEM_ID, E.ITEM_NM AS EX_ITEM_NM, E.BASE_MIN AS EX_BASE_MIN FROM MST_SEAT_ITEM S INNER JOIN MST_EX_SEAT_ITEM E ON E.ITEM_ID = S.EX_ITEM_ID WHERE S.BASE_MIN >= @USEMIN AND AUTO_PACK_ID = @AUTO_PACK_ID AND S.ITEM_ID <> AUTO_PACK_ID AND S.WEEK_FLG = 10 ORDER BY S.BASE_MIN";

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
			.input('MEMBER_FLG', sql.Int, uriageMemberFlg)
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
  
  async function CALC_TOTAL_MINS(seatUseStartDate,seatUseEndDate) {

    console.log(seatUseStartDate,seatUseEndDate);

		let _seatUseStartDate = new Date(convert_datetime(seatUseStartDate));
		let _seatUseEndDate = new Date(seatUseEndDate);
		let totalMins = 0;
		let diffMins = 0;

		try {
			totalMins = Math.floor(_seatUseEndDate - _seatUseStartDate);
			// get minutes
			diffMins = Math.floor(totalMins / 60000);
		} catch(err) {
			console.log(err);
      sql.close();
      res.status(200).send(error.type_11);
		}
		return diffMins;
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

function convert_datetime(datetime) {
	return datetime.toISOString().replace(/T/, ' ').replace(/\..+/, '');
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

function getDateTimeToString(string_datetime) {
	let string_datetime_date = string_datetime.getFullYear()+'-'+((string_datetime.getMonth()+1) < 10 ? '0'+(string_datetime.getMonth()+1):(string_datetime.getMonth()+1))+'-'+(string_datetime.getDate() < 10 ?'0'+string_datetime.getDate():string_datetime.getDate());
	let string_datetime_time = (string_datetime.getHours()<10?'0'+string_datetime.getHours():string_datetime.getHours())+':'+(string_datetime.getMinutes()<10?'0'+string_datetime.getMinutes():string_datetime.getMinutes())+':'+(string_datetime.getSeconds()<10?'0'+string_datetime.getSeconds():string_datetime.getSeconds());
	return string_datetime_date+' '+string_datetime_time;
}

app.listen(PORT, () => console.log(`Server is now running on port ${PORT}`));
