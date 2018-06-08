const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

class Authentication {
    constructor() {
        this.variables = new Object();
    }

    set credential(cred) {
        let rules = {
            'username':'admin',
            'password':'admin123'
        };
        this.validation(rules,cred)
        .then(result => {
            return result;
        })
        .catch(err => {
            console.log(err);
        });
    }

    validation(rules,data) {
        let bool = false;
        let error = 0;
        return new Promise((resolve,reject) => {
            if(typeof rules === 'object' && typeof data === 'object') {
                for(let i in rules) {
                    if(!data[i]) {
                        reject(`Some variables are incorrect.`);
                        error++;
                        break;
                    }
                }
                if(!error) bool = true;
            } else {
                reject('Authentication failed.');
            }
            resolve(bool);
        });
    }

}

const APP_LOGGER = (req,res,next) => {
    const auth = new Authentication();
    let my_data = {
        'username':'admin',
        'password':'admin123'
    }
    if((auth.credential = my_data)) {
        console.log('true');
    } else {
        console.log('false');
    }

    res.end();
};

app.use(APP_LOGGER);

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));