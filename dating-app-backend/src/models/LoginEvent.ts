import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

class LoginEvent extends Model {
  public id!: string;
  public user_id!: string | null;
  public channel!: string;
  public ip!: string | null;
  public ok!: boolean;
  public reason_code!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

LoginEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    channel: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ok: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    reason_code: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'auth_login_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default LoginEvent;
