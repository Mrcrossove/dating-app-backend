import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Report extends Model {
  public id!: string;
  public user_id!: string;
  public target_id!: string;
  public reason!: string;
  public detail!: string;
  public readonly created_at!: Date;
}

Report.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    target_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    detail: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_reports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

export default Report;

