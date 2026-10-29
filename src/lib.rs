/// Version of the build, from the git tag, see build.rs
pub const VERSION: &str = env!("BOT_VERSION");

pub mod alarm;
pub mod bot;
pub mod captcha;
pub mod commands;
pub mod duration;
pub mod langday;
pub mod lid;
pub mod md;
pub mod members;
pub mod state;
pub mod violations;
