import { IsString, MaxLength, MinLength } from 'class-validator';

export class ParseRecipeDto {
    @IsString()
    @MinLength(3)
    @MaxLength(8000)
    text!: string;
}
