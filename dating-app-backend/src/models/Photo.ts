import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import User from './User';

class Photo extends Model {
  public id!: string;
  public user_id!: string;
  public url!: string;
  public is_primary!: boolean;
  public readonly created_at!: Date;
}

Photo.init(
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
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'photos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default Photo;