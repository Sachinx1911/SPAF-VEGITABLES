<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Sign-in, and the one property that is easy to lose by accident: an email that
 * has no account must be indistinguishable from an email that has one and was
 * given the wrong password. Anything that separates the two — a different
 * status, a different message, a server error — hands an attacker a list of
 * which addresses are real.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        User::factory()->create([
            'name' => 'Rajesh Patil',
            'email' => 'rajesh.patil@svproagro.in',
            'mobile' => '9820011021',
            'role_key' => 'admin',
            'password' => Hash::make('CorrectHorse123!'),
        ]);
    }

    public function test_a_valid_login_returns_a_token(): void
    {
        $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'CorrectHorse123!',
        ])->assertOk()->assertJsonStructure(['token', 'expires_at', 'user']);
    }

    public function test_the_mobile_number_signs_in_the_same_account(): void
    {
        $this->postJson('/api/auth/login', [
            'identifier' => '98200 11021',
            'password' => 'CorrectHorse123!',
        ])->assertOk();
    }

    /**
     * Regression: the placeholder hash compared against when no user matched was
     * a filler string rather than a real bcrypt hash. Laravel's hasher checks the
     * algorithm before comparing and threw, so every unknown email returned 500
     * with "This password does not use the Bcrypt algorithm" — turning the line
     * meant to hide which accounts exist into the thing that revealed them.
     */
    public function test_an_unknown_email_is_rejected_the_same_way_as_a_wrong_password(): void
    {
        $unknown = $this->postJson('/api/auth/login', [
            'identifier' => 'nobody@svproagro.in',
            'password' => 'CorrectHorse123!',
        ]);

        $wrong = $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'not-the-password',
        ]);

        $unknown->assertStatus(422);
        $this->assertSame($wrong->status(), $unknown->status());
        $this->assertSame($wrong->json('errors'), $unknown->json('errors'));
    }

    public function test_an_unknown_mobile_number_is_rejected_the_same_way(): void
    {
        $this->postJson('/api/auth/login', [
            'identifier' => '90000 00000',
            'password' => 'CorrectHorse123!',
        ])->assertStatus(422);
    }

    /** The prototype's shared password must not open a real account. */
    public function test_the_demo_password_does_not_work_against_the_server(): void
    {
        $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'spaf@123',
        ])->assertStatus(422);
    }

    public function test_an_inactive_account_cannot_sign_in(): void
    {
        User::where('email', 'rajesh.patil@svproagro.in')->update(['status' => 'Inactive']);

        $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'CorrectHorse123!',
        ])->assertStatus(403);
    }

    public function test_repeated_failures_are_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'identifier' => 'rajesh.patil@svproagro.in',
                'password' => 'wrong',
            ])->assertStatus(422);
        }

        // The sixth is refused outright, and the correct password does not help.
        $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'CorrectHorse123!',
        ])->assertStatus(429);
    }

    public function test_me_returns_the_permission_matrix_the_server_enforces(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'identifier' => 'rajesh.patil@svproagro.in',
            'password' => 'CorrectHorse123!',
        ])->json('token');

        $this->withToken($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonStructure(['user', 'permissions']);
    }

    public function test_an_unauthenticated_request_is_refused(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }
}
