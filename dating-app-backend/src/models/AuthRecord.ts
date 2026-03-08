import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class AuthRecord extends Model {
  public id!: string;
  public user_id!: string;
  public type!: string;
  public status!: string;
  public payload!: string;
  public readonly created_at!: Date;
  public reviewed_at!: Date;
}

AuthRecord.init(
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
    type: {
      type: DataTypes.ENUM('real_name', 'company', 'education'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
    },
    payload: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '{}',
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'auth_records',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'type'],
      },
    ],
  }
);

export default AuthRecord;

