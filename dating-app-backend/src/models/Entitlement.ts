import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

export type EntitlementProductKey = 'partner_profile' | 'compatibility' | 'fortune_2026' | 'dayun_report' | 'super_like';

class Entitlement extends Model {
  public id!: string;
  public user_id!: string;
  public product_key!: EntitlementProductKey;
  public readonly created_at!: Date;
}

Entitlement.init(
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
    product_key: {
      type: DataTypes.ENUM('partner_profile', 'compatibility', 'fortune_2026', 'dayun_report', 'super_like'),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'entitlements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'product_key'],
      },
    ],
  }
);

export default Entitlement;
