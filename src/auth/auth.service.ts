import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    private readonly adminNickname = process.env['ADMIN_NICKNAME'];
    private readonly adminPassword = process.env['ADMIN_PASSWORD'];

    constructor(private readonly jwtService: JwtService) {}

    async login(nickname: string, password: string) {
        if (nickname !== this.adminNickname || password !== this.adminPassword) {
            throw new UnauthorizedException('Невірний нікнейм або пароль');
        }

        const payload = { sub: nickname, role: 'admin' };
        const token = await this.jwtService.signAsync(payload);

        return { token, nickname };
    }

    async validateToken(token: string) {
        try {
            return await this.jwtService.verifyAsync(token);
        } catch {
            throw new UnauthorizedException('Токен недійсний або прострочений');
        }
    }
}
