import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Like extends Model {
  public id!: string;
  public user_id!: string;
  public target_id!: string;
  public readonly created_at!: Date;
}

Like.init(
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
  },
  {
    sequelize,
    tableName: 'likes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'target_id'],
      },
    ],
  }
);

export default Like;
