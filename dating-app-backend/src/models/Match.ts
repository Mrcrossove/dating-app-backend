import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Match extends Model {
  public id!: string;
  public user1_id!: string;
  public user2_id!: string;
  public compatibility_score!: number;
  public status!: string;
  public readonly created_at!: Date;
}

Match.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user1_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    user2_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id',
      },
    },
    compatibility_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 100,
      },
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'blocked'),
      defaultValue: 'active',
    },
  },
  {
    sequelize,
    tableName: 'matches',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['user1_id', 'user2_id'],
      },
    ],
  }
);

export default Match;