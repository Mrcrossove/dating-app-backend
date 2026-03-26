import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class ReferralCreditLedger extends Model {
  public id!: string;
  public user_id!: string;
  public change_amount!: number;
  public balance_after!: number;
  public source_type!: string;
  public source_id!: string | null;
  public note!: string | null;
  public meta!: string;
  public readonly created_at!: Date;
}

ReferralCreditLedger.init(
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
    change_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    source_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    source_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    note: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    meta: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
    },
  },
  {
    sequelize,
    tableName: 'referral_credit_ledger',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'created_at'] },
      { fields: ['source_type', 'source_id'] },
    ],
  }
);

export default ReferralCreditLedger;
