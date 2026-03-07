import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Like extends Model {
  public id!: number;
  public user_id!: number;
  public target_id!: number;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Like.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    target_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'likes',
    underscored: true,
  }
);

export default Like;
