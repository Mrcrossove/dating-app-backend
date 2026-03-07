import { Sequelize } from 'sequelize';
import path from 'path';

// 临时使用 SQLite 进行本地开发测试
// 生产环境请切换到 PostgreSQL
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
});

export default sequelize;