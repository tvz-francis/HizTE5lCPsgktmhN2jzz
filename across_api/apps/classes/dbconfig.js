class DBConfig {
  constructor() {
    return this.connection;
  }
  get connection() {
    return {
      user:'sa',
      password:'xyz0',
      server:'192.168.128.121\\sqlexpress',
      database:'APITestDB'
    };
  }
}

module.exports = new DBConfig();