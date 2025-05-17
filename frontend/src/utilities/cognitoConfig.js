import { CognitoUserPool } from "amazon-cognito-identity-js";
import { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } from "./constants";

const poolData = {
  UserPoolId: COGNITO_USER_POOL_ID,
  ClientId:   COGNITO_CLIENT_ID,
};

export default new CognitoUserPool(poolData);
