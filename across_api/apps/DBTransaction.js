class _DBTransaction {

    constructor() {
        this.Pool = '';
        this.rolledBack = false;
        this.commit = false;
        this.transaction;
    }

    set Begin(cb) {
        try{
            this.transaction = this.Pool.transaction();
        
            this.transaction.begin(async err => {
                if(err) throw err;

                this.transaction.on('rollback',aborted => {
                    this.rolledBack = true;
                    console.log('Transaction on rollback');
                });

                cb((result) => {

                    result().then(v => {
                        
                    });

                });

                // let checkRollBack = await _rollBack();
                

            });
        } catch(err) {
            return err;
        }
        
    }

    set RollBack(bool = false) {
        this.rolledBack = bool;
    }

    set Commit(bool = false) {
        this.commit = bool;
    }

    // async _rollBack() {
    //     this.transaction.on('rollback',aborted => {
    //         this.rolledBack = true;
    //         console.log('Transaction on rollback');
    //     });
    // }

}

exports.DB = {
    Transaction:new _DBTransaction()
};