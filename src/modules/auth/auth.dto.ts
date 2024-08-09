import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignInDTO {
  @IsNotEmpty()
  @IsEmail()
  email: string;
  @IsNotEmpty()
  password: string;
}
