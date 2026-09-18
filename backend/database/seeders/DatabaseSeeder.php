<?php

namespace Database\Seeders;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Brings a fresh database up to a usable state: roles, settings, and one admin.
 *
 * Deliberately does NOT create demo orders or invoices. The prototype's seeded
 * data exists so the UI has something to show; a real installation starts empty
 * and fills up from the masters the business actually imports.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RoleSeeder::class);

        $this->seedSettings();
        $this->seedAdmin();

        // The business's real routes, suppliers, 40 customers and ~125 items,
        // with their price list. This is master data, not demo transactions —
        // the app is unusable without it, and MasterSeeder is idempotent, so a
        // reseed corrects it rather than duplicating. An operator importing
        // their own current list instead can comment this out.
        $this->call(MasterSeeder::class);
    }

    private function seedSettings(): void
    {
        $defaults = [
            'company_name' => 'SV-PRO AGRO FOODS PVT LTD',
            'company_address' => '',
            'company_gstin' => '',
            'company_phone' => '',
            'company_email' => '',
            // Orders after this time roll to the following delivery slot.
            'order_cutoff_time' => '22:00',
            'max_sheet_columns' => '14',
            'default_payment_terms_days' => '15',
            'invoice_prefix' => 'SPAF',
            'challan_prefix' => 'DC',
            // Shared terminals on the packing floor should not stay signed in.
            'session_timeout_minutes' => '30',
        ];

        foreach ($defaults as $key => $value) {
            Setting::firstOrCreate(['key' => $key], ['value' => $value]);
        }
    }

    private function seedAdmin(): void
    {
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');

        if (! $email) {
            $this->command->warn('ADMIN_EMAIL not set — no admin created. Add it to .env and reseed.');

            return;
        }

        if (User::where('email', $email)->exists()) {
            $this->command->info("Admin {$email} already exists — left untouched.");

            return;
        }

        // A generated password is safer than a default one: nothing ships with a
        // password anybody could guess from the source.
        $generated = $password ?: Str::password(16);

        User::create([
            'name' => env('ADMIN_NAME', 'Administrator'),
            'email' => strtolower($email),
            'mobile' => env('ADMIN_MOBILE', ''),
            'password' => Hash::make($generated),
            'role_key' => 'admin',
            'status' => 'Active',
        ]);

        $this->command->info("Admin created: {$email}");

        if (! $password) {
            $this->command->warn("Generated password: {$generated}");
            $this->command->warn('Copy it now — it is not stored anywhere and will not be shown again.');
        }
    }
}
