import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

class RefreshToken extends Model {
  public id!: string;
  public user_id!: string;
  public token_hash!: string;
  public device_id!: string | null;
  public ip!: string | null;
  public user_agent!: string | null;
  public expires_at!: Date;
  public revoked_at!: Date | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    token_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
    },
    device_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'auth_refresh_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default RefreshToken;
