const mongoose = require('mongoose');
const AthleteProfile = require('./models/AthleteProfile');
const Video = require('./models/Video');

console.log('Verifying updated schemas...');

// Test Complete AthleteProfile (all 9 screens)
console.log('Testing Updated AthleteProfile...');
const completeProfile = new AthleteProfile({
    user: new mongoose.Types.ObjectId(),

    // Screen 1
    display_name: 'John Smith',
    country: 'USA',
    age: 25,
    sex: 'Male',
    experience_years: 3,
    height_cm: 180,
    bodyweight_value: 85,
    preferred_unit: 'Metric',

    // Screen 2
    strength_stats: {
        snatch: { value: 123, checked: true },
        power_snatch: { value: 118, checked: true },
        jerk: { value: 168, checked: true },
        back_squat: { value: 210, checked: true }
    },
    strength_accuracy: 'Tested',

    // Screen 4
    considerations: {
        has_limitations: true,
        affected_areas: ['Lower back', 'Knees'],
        impact_level: 'Moderate',
        triggers: ['Overhead position', 'When fatigued']
    },

    // Screen 5
    availability: {
        training_days_per_week: 4,
        session_duration: 60,
        preferred_rest_days: ['Wednesday', 'Saturday', 'Sunday']
    },

    // Screen 6
    equipment: {
        optional: ['Lifting Blocks', 'Pull-up Bar']
    },

    // Screen 7
    training_preference: 'Balanced',

    // Screen 8
    performance_gaps: ['Limited leg endurance', 'Slow pull from the floor']
});

const profileError = completeProfile.validateSync();
if (profileError) {
    console.error('❌ Complete AthleteProfile failed validation:', profileError);
    process.exit(1);
} else {
    console.log('✅ Complete AthleteProfile (all 9 screens) passed validation');
}

// Test Invalid Training Preference
const invalidProfile = new AthleteProfile({
    user: new mongoose.Types.ObjectId(),
    training_preference: 'InvalidPreference'
});
const invalidError = invalidProfile.validateSync();
if (invalidError && invalidError.errors['training_preference']) {
    console.log('✅ Invalid training_preference detected correctly');
} else {
    console.error('❌ Should have failed on invalid training_preference');
    process.exit(1);
}

// Test Video still works
console.log('Testing Video model...');
const validVideo = new Video({
    user: new mongoose.Types.ObjectId(),
    lift_name: 'Snatch',
    category: 'Classic',
    reps: 1,
    weight_value: 123,
    video_url: 'http://example.com/video.mp4'
});

const videoError = validVideo.validateSync();
if (videoError) {
    console.error('❌ Valid Video failed validation:', videoError);
    process.exit(1);
} else {
    console.log('✅ Video model still works correctly');
}

console.log('🎉 All schema verifications passed!');
process.exit(0);
