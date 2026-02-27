using BurnoutAnalysis.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BurnoutAnalysis.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<ApplicationUser, Microsoft.AspNetCore.Identity.IdentityRole<int>, int>(options)
{
    public DbSet<BurnoutLog> BurnoutLogs => Set<BurnoutLog>();
    public DbSet<BurnoutRecord> BurnoutRecords => Set<BurnoutRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(u =>
        {
            u.ToTable("users");
            u.Property(x => x.Name).HasMaxLength(255);
            u.Property(x => x.GoogleId).HasMaxLength(128);
            u.Property(x => x.PictureUrl).HasMaxLength(1024);
            u.HasIndex(x => x.GoogleId).HasFilter("\"GoogleId\" IS NOT NULL");
        });

        builder.Entity<BurnoutLog>(log =>
        {
            log.ToTable("burnout_logs");
            log.Property(x => x.DayType).HasMaxLength(16).HasDefaultValue("Weekday");
            log.Property(x => x.WorkHours).HasColumnName("work_hours");
            log.Property(x => x.ScreenTimeHours).HasColumnName("screen_time_hours");
            log.Property(x => x.MeetingsCount).HasColumnName("meetings_count");
            log.Property(x => x.AppSwitches).HasColumnName("app_switches");
            log.Property(x => x.AfterHoursWork).HasColumnName("after_hours_work");
            log.Property(x => x.SleepHours).HasColumnName("sleep_hours");
            log.Property(x => x.IsolationIndex).HasColumnName("isolation_index");
            log.Property(x => x.FatigueScore).HasColumnName("fatigue_score");
            log.Property(x => x.BreaksTaken).HasColumnName("breaks_taken");
            log.Property(x => x.IsProcessed).HasColumnName("is_processed");
            log.Property(x => x.DataRegistro).HasColumnName("data_registro");
            log.Property(x => x.CreatedAt).HasColumnName("created_at");
            log.HasOne(x => x.User).WithMany(u => u.BurnoutLogs).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            log.HasIndex(x => new { x.UserId, x.DataRegistro });
        });

        builder.Entity<BurnoutRecord>(rec =>
        {
            rec.ToTable("burnout");
            rec.Property(x => x.DayType).HasMaxLength(16);
            rec.Property(x => x.BurnoutRisk).HasMaxLength(16);
            rec.Property(x => x.Archetype).HasMaxLength(64);
            rec.Property(x => x.WorkHours).HasColumnName("work_hours");
            rec.Property(x => x.ScreenTimeHours).HasColumnName("screen_time_hours");
            rec.Property(x => x.MeetingsCount).HasColumnName("meetings_count");
            rec.Property(x => x.BreaksTaken).HasColumnName("breaks_taken");
            rec.Property(x => x.AfterHoursWork).HasColumnName("after_hours_work");
            rec.Property(x => x.AppSwitches).HasColumnName("app_switches");
            rec.Property(x => x.SleepHours).HasColumnName("sleep_hours");
            rec.Property(x => x.TaskCompletion).HasColumnName("task_completion");
            rec.Property(x => x.IsolationIndex).HasColumnName("isolation_index");
            rec.Property(x => x.FatigueScore).HasColumnName("fatigue_score");
            rec.Property(x => x.BurnoutScore).HasColumnName("burnout_score");
            rec.Property(x => x.BurnoutRisk).HasColumnName("burnout_risk");
            rec.Property(x => x.CreatedAt).HasColumnName("created_at");
            rec.HasOne(x => x.User).WithMany(u => u.BurnoutRecords).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            rec.HasOne(x => x.Log).WithOne(l => l.BurnoutRecord).HasForeignKey<BurnoutRecord>(x => x.LogId);
        });
    }
}
