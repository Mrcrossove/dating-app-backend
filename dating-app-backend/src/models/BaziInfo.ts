import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class BaziInfo extends Model {
  public id!: string;
  public user_id!: string;
  public year_pillar!: string;
  public month_pillar!: string;
  public day_pillar!: string;
  public hour_pillar!: string;
  public element!: string;
  public report!: string;
  public readonly created_at!: Date;
}

BaziInfo.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    year_pillar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    month_pillar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    day_pillar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    hour_pillar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    element: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    report: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'bazi_info',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default BaziInfo;