import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Verification extends Model {
  public id!: string;
  public user_id!: string;
  public front_image_url!: string;
  public back_image_url!: string;
  public id_type!: string;
  public status!: string;
  public admin_remark!: string;
  public readonly created_at!: Date;
  public reviewed_at!: Date;
}

Verification.init(
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
    front_image_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    back_image_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    id_type: {
      type: DataTypes.ENUM('passport', 'id'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
    },
    admin_remark: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'verifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default Verification;