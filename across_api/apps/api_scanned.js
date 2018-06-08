const server = require('../config/server');
const bodyParser = require('body-parser');
const app = server.app;

app.use(bodyParser.json());

app.post('/IP/api/sales', async (req, res) => {
	
	// let TBL_URIAGE = server.pool
	// .input('seatno', server.sql.Int, '0106')
	// .query("SELECT SUM([TBL_URIAGE].[URIAGE_YEN]) AS [ALL_TOTAL] FROM [POS-_-00141-_-4_04].[dbo].[TBL_URIAGE] AS [TBL_URIAGE] WHERE [TBL_URIAGE].[SEAT_NO] = @seatno AND [TBL_URIAGE].[DELETE_FLG] = 0 AND [TBL_URIAGE].[SEISAN_FLG] = 0;");

	// let pool = server.pool;

	console.log(server.db.config());
	
});