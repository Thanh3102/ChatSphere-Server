import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateUserDTO {
  @IsNotEmpty()
  name: string;
  @IsNotEmpty()
  password: string;
  @IsNotEmpty()
  @IsEmail()
  email: string;
  @IsNotEmpty()
  dateOfBirth: Date;
  @IsNotEmpty()
  phoneNumber: string;
  @IsNotEmpty()
  gender: string;
}

export class UpdateUserDTO {
  @IsNotEmpty()
  id: string;
  @IsNotEmpty()
  name: string;
  @IsNotEmpty()
  dateOfBirth: Date;
  @IsNotEmpty()
  phoneNumber: string;
  @IsNotEmpty()
  gender: string;
}

export class ChangePasswordDTO {
  @IsNotEmpty()
  id: string;
  @IsNotEmpty()
  oldPassword: string;
  @IsNotEmpty()
  newPassword: string;
}
